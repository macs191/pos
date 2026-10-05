import { applicationDefault, cert, getApps, initializeApp, type App } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getDatabase, type Reference } from "firebase-admin/database";
import { ENV } from "./_core/env.js";

let firebaseApp: App | null = null;

function getAdminApp(): App {
  if (firebaseApp) return firebaseApp;
  const existing = getApps()[0];
  if (existing) {
    firebaseApp = existing;
    return existing;
  }

  const databaseURL = process.env.FIREBASE_DATABASE_URL || process.env.VITE_FIREBASE_DATABASE_URL || ENV.firebaseDatabaseUrl;
  const projectId = process.env.FIREBASE_PROJECT_ID || process.env.VITE_FIREBASE_PROJECT_ID || ENV.firebaseProjectId;
  if (!databaseURL || !projectId) {
    throw new Error("Firebase Admin is not configured. Set FIREBASE_DATABASE_URL and FIREBASE_PROJECT_ID.");
  }

  let credential;
  const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (serviceAccountJson) {
    let serviceAccount: { project_id?: string; projectId?: string; client_email?: string; clientEmail?: string; private_key?: string; privateKey?: string };
    try {
      serviceAccount = JSON.parse(serviceAccountJson) as typeof serviceAccount;
    } catch {
      throw new Error("FIREBASE_SERVICE_ACCOUNT_JSON must contain valid service-account JSON.");
    }
    const clientEmail = serviceAccount.client_email || serviceAccount.clientEmail;
    const privateKey = (serviceAccount.private_key || serviceAccount.privateKey || "").replace(/\\n/g, "\n");
    if (!clientEmail || !privateKey.includes("PRIVATE KEY")) {
      throw new Error("FIREBASE_SERVICE_ACCOUNT_JSON is missing client_email or private_key.");
    }
    credential = cert({
      projectId: serviceAccount.project_id || serviceAccount.projectId || projectId,
      clientEmail,
      privateKey,
    });
  } else if (process.env.GOOGLE_APPLICATION_CREDENTIALS || process.env.K_SERVICE || process.env.FUNCTIONS_EMULATOR) {
    credential = applicationDefault();
  } else {
    throw new Error("Set FIREBASE_SERVICE_ACCOUNT_JSON or configure Google Application Default Credentials for Firebase Admin.");
  }

  firebaseApp = initializeApp({ credential, databaseURL, projectId }, "souqi-server");
  return firebaseApp;
}

export type FirebaseRealtimeReference = {
  get(): Promise<{ exists(): boolean; val(): unknown }>;
  transaction(update: (current: unknown) => unknown): Promise<{ committed: boolean; snapshot: { val(): unknown } }>;
  set(value: unknown): Promise<void>;
  update(values: Record<string, unknown>): Promise<void>;
};

export type FirebaseRealtimeDatabase = { ref(path?: string): FirebaseRealtimeReference };

function wrapReference(reference: Reference): FirebaseRealtimeReference {
  return {
    async get() {
      const snapshot = await reference.get();
      return { exists: () => snapshot.exists(), val: () => snapshot.val() };
    },
    async set(value) {
      await reference.set(value);
    },
    async update(values) {
      await reference.update(values);
    },
    async transaction(update) {
      const result = await reference.transaction((current: unknown) => update(current), undefined, false);
      return { committed: result.committed, snapshot: { val: () => result.snapshot.val() } };
    },
  };
}

export function firebaseRealtimeDb(): FirebaseRealtimeDatabase {
  // Firebase Admin's database declaration differs between some Vercel TS
  // resolver versions; its runtime Database still exposes the documented ref().
  const database = getDatabase(getAdminApp()) as unknown as { ref(path?: string): Reference };
  return { ref: (path = "") => wrapReference(database.ref(path)) };
}

export async function verifyFirebaseIdToken(token: string) {
  return getAuth(getAdminApp()).verifyIdToken(token, true);
}
