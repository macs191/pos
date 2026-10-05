import { AsyncLocalStorage } from "node:async_hooks";
import { decodeJwt } from "jose";
import { ENV } from "./_core/env.js";

export type FirebaseQuery = {
  orderByChild?: string;
  equalTo?: string | number | boolean;
  limitToFirst?: number;
  limitToLast?: number;
};

type FirebaseSnapshot = { exists(): boolean; val(): unknown };
type FirebaseTransactionResult = { committed: boolean; snapshot: { val(): unknown } };

export type FirebaseRealtimeReference = {
  get(query?: FirebaseQuery, includeEtag?: boolean): Promise<FirebaseSnapshot>;
  create(value: unknown): Promise<void>;
  transaction(update: (current: unknown) => unknown): Promise<FirebaseTransactionResult>;
  set(value: unknown): Promise<void>;
  update(values: Record<string, unknown>): Promise<void>;
};

export type FirebaseRealtimeDatabase = { ref(path?: string): FirebaseRealtimeReference };

const idTokenStorage = new AsyncLocalStorage<string>();

export function runWithFirebaseIdToken<T>(idToken: string | null | undefined, callback: () => T): T {
  return idTokenStorage.run(idToken || "", callback);
}

export function firebaseIdTokenFromAuthorization(authorization: unknown): string | null {
  return typeof authorization === "string" && authorization.startsWith("Bearer ")
    ? authorization.slice(7).trim() || null
    : null;
}

function requestToken() {
  const token = idTokenStorage.getStore();
  if (!token) throw new Error("FIREBASE_AUTH_TOKEN_REQUIRED");
  return token;
}

function databaseBaseUrl() {
  const value = process.env.VITE_FIREBASE_DATABASE_URL || ENV.firebaseDatabaseUrl;
  if (!value) throw new Error("FIREBASE_DATABASE_URL_MISSING");
  return value.replace(/\/+$/, "");
}

function firebaseUrl(path: string, query?: FirebaseQuery) {
  const safePath = path.split("/").filter(Boolean).map(encodeURIComponent).join("/");
  const url = new URL(`${databaseBaseUrl()}/${safePath ? `${safePath}/` : ""}.json`);
  url.searchParams.set("auth", requestToken());
  if (query?.orderByChild) url.searchParams.set("orderBy", JSON.stringify(query.orderByChild));
  if (query && "equalTo" in query) url.searchParams.set("equalTo", JSON.stringify(query.equalTo));
  if (query?.limitToFirst !== undefined) url.searchParams.set("limitToFirst", String(query.limitToFirst));
  if (query?.limitToLast !== undefined) url.searchParams.set("limitToLast", String(query.limitToLast));
  return url.toString();
}

class FirebaseRestError extends Error {
  constructor(operation: "READ" | "WRITE" | "UPDATE", status: number) {
    super(`FIREBASE_${operation}_FAILED:${status}`);
    this.name = "FirebaseRestError";
  }
}

async function send(path: string, method: "GET" | "PUT" | "PATCH", value?: unknown, query?: FirebaseQuery, headers: Record<string, string> = {}) {
  const response = await fetch(firebaseUrl(path, query), {
    method,
    headers: { ...(value === undefined ? {} : { "Content-Type": "application/json" }), ...headers },
    ...(value === undefined ? {} : { body: JSON.stringify(value) }),
    cache: "no-store",
  });
  if (!response.ok) throw new FirebaseRestError(method === "GET" ? "READ" : method === "PATCH" ? "UPDATE" : "WRITE", response.status);
  const text = await response.text();
  let parsed: unknown = null;
  if (text) {
    try { parsed = JSON.parse(text); } catch { parsed = null; }
  }
  return { response, value: parsed };
}

function snapshot(value: unknown): FirebaseSnapshot {
  return { exists: () => value !== null && value !== undefined, val: () => value };
}

export function firebaseRealtimeDb(): FirebaseRealtimeDatabase {
  return {
    ref(path = "") {
      return {
        async get(query, includeEtag = false) {
          const { response, value } = await send(path, "GET", undefined, query, includeEtag ? { "X-Firebase-ETag": "true" } : {});
          return Object.assign(snapshot(value), { etag: response.headers.get("ETag") || "null_etag" });
        },
        async create(value) {
          await send(path, "PUT", value, undefined, { "If-Match": "null_etag" });
        },
        async set(value) {
          await send(path, "PUT", value);
        },
        async update(values) {
          await send(path, "PATCH", values);
        },
        async transaction(update) {
          for (let attempt = 0; attempt < 6; attempt += 1) {
            const current = await this.get(undefined, true) as FirebaseSnapshot & { etag?: string };
            const nextValue = update(current.val());
            if (nextValue === undefined) return { committed: false, snapshot: { val: () => current.val() } };
            try {
              await send(path, "PUT", nextValue, undefined, { "If-Match": current.etag || "null_etag" });
              return { committed: true, snapshot: { val: () => nextValue } };
            } catch (error) {
              if (!(error instanceof FirebaseRestError) || !error.message.endsWith(":412")) throw error;
            }
          }
          throw new Error("FIREBASE_TRANSACTION_RETRY_LIMIT");
        },
      };
    },
  };
}

export async function verifyFirebaseIdToken(idToken: string) {
  const apiKey = process.env.VITE_FIREBASE_API_KEY;
  const projectId = process.env.VITE_FIREBASE_PROJECT_ID || ENV.firebaseProjectId;
  if (!apiKey || !projectId) throw new Error("FIREBASE_WEB_CONFIG_MISSING");

  let response: Response;
  try {
    response = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${encodeURIComponent(apiKey)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ idToken }),
      cache: "no-store",
    });
  } catch {
    throw new Error("FIREBASE_AUTH_LOOKUP_UNAVAILABLE");
  }
  if (!response.ok) throw new Error("FIREBASE_ID_TOKEN_INVALID");
  const payload = await response.json() as { users?: Array<{ localId?: string; email?: string; emailVerified?: boolean; displayName?: string; disabled?: boolean; validSince?: string }> };
  const account = payload.users?.[0];
  if (!account?.localId || account.disabled) throw new Error("FIREBASE_ID_TOKEN_INVALID");

  let claims: Record<string, unknown>;
  try { claims = decodeJwt(idToken) as Record<string, unknown>; } catch { throw new Error("FIREBASE_ID_TOKEN_INVALID"); }
  const now = Math.floor(Date.now() / 1000);
  if (claims.aud !== projectId || claims.iss !== `https://securetoken.google.com/${projectId}` || claims.sub !== account.localId || Number(claims.exp || 0) <= now) {
    throw new Error("FIREBASE_ID_TOKEN_INVALID");
  }
  if (account.validSince && Number(claims.auth_time || 0) < Number(account.validSince)) throw new Error("FIREBASE_ID_TOKEN_REVOKED");

  return {
    uid: account.localId,
    email: account.email ?? null,
    email_verified: account.emailVerified === true,
    name: account.displayName ?? account.email ?? null,
  };
}
