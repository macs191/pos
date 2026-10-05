import { AsyncLocalStorage } from "node:async_hooks";
import { ENV } from "./_core/env.js";

const tokenStorage = new AsyncLocalStorage<string>();

export function runWithFirebaseToken<T>(token: string, callback: () => T): T {
  return tokenStorage.run(token, callback);
}

function databaseUrl() {
  const url = process.env.VITE_FIREBASE_DATABASE_URL || process.env.FIREBASE_DATABASE_URL || ENV.firebaseDatabaseUrl;
  if (!url) throw new Error("Firebase Realtime Database URL is not configured.");
  return url.replace(/\/$/, "");
}

function token() {
  const value = tokenStorage.getStore();
  if (!value) throw new Error("Firebase ID token is missing.");
  return value;
}

function endpoint(path: string) {
  const normalized = path.replace(/^\/+/, "");
  return `${databaseUrl()}/${normalized}.json?auth=${encodeURIComponent(token())}`;
}

async function assertOk(response: Response, operation: string) {
  if (response.ok) return;
  const body = await response.text().catch(() => "");
  let detail = body;
  try { detail = String((JSON.parse(body) as { error?: string }).error || body); } catch { /* keep raw response */ }
  throw new Error(`FIREBASE_${operation}_FAILED:${response.status}:${detail.slice(0, 240)}`);
}

export type FirebaseRealtimeReference = {
  get(): Promise<{ exists(): boolean; val(): unknown }>;
  transaction(update: (current: unknown) => unknown): Promise<{ snapshot: { val(): unknown } }>;
  set(value: unknown): Promise<void>;
  update(values: Record<string, unknown>): Promise<void>;
};

export type FirebaseRealtimeDatabase = { ref(path?: string): FirebaseRealtimeReference };

function reference(path = ""): FirebaseRealtimeReference {
  return {
    async get() {
      const response = await fetch(endpoint(path));
      await assertOk(response, "READ");
      const value = await response.json();
      return { exists: () => value !== null, val: () => value };
    },
    async set(value) {
      const response = await fetch(endpoint(path), { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(value) });
      await assertOk(response, "WRITE");
    },
    async update(values) {
      const response = await fetch(endpoint(path), { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(values) });
      await assertOk(response, "UPDATE");
    },
    async transaction(update) {
      const current = await this.get();
      const next = update(current.val());
      await this.set(next);
      return { snapshot: { val: () => next } };
    },
  };
}

export function firebaseRealtimeDb(): FirebaseRealtimeDatabase {
  return { ref: (path?: string) => reference(path) };
}
