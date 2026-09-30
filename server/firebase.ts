import { cert, getApps, initializeApp, type App } from "firebase-admin/app";
import { getAuth, type Auth } from "firebase-admin/auth";
import { getDatabase, type Database } from "firebase-admin/database";
import { ENV } from "./_core/env";

let firebaseApp: App | null = null;

function getFirebaseApp() {
  if (firebaseApp) return firebaseApp;
  const existing = getApps()[0];
  if (existing) {
    firebaseApp = existing;
    return existing;
  }
  const projectId = process.env.FIREBASE_PROJECT_ID || "";
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL || "";
  const privateKey = (process.env.FIREBASE_PRIVATE_KEY || "").replace(/\\n/g, "\n");
  const databaseURL = process.env.FIREBASE_DATABASE_URL || ENV.firebaseDatabaseUrl || "";
  if (!projectId || !clientEmail || !privateKey || !databaseURL) {
    throw new Error("Firebase Admin is not configured. Set FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY, and FIREBASE_DATABASE_URL.");
  }
  firebaseApp = initializeApp({
    credential: cert({ projectId, clientEmail, privateKey }),
    databaseURL,
  });
  return firebaseApp;
}

export function firebaseAdminAuth(): Auth {
  return getAuth(getFirebaseApp());
}

export function firebaseRealtimeDb(): Database {
  return getDatabase(getFirebaseApp());
}
