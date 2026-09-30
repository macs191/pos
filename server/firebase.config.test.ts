import { describe, expect, it } from "vitest";
import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getDatabase } from "firebase-admin/database";

const required = ["FIREBASE_PROJECT_ID", "FIREBASE_CLIENT_EMAIL", "FIREBASE_PRIVATE_KEY", "FIREBASE_DATABASE_URL"] as const;

describe("Firebase Admin configuration", () => {
  it("authenticates against Realtime Database with the supplied service account", async () => {
    for (const key of required) expect(process.env[key], `${key} is required`).toBeTruthy();
    const app = getApps()[0] ?? initializeApp({
      credential: cert({
        projectId: process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
      }),
      databaseURL: process.env.FIREBASE_DATABASE_URL,
    });
    const ref = getDatabase(app).ref(`_system/connection-tests/${Date.now()}`);
    await ref.set({ ok: true });
    const snapshot = await ref.get();
    expect(snapshot.val()).toMatchObject({ ok: true });
    await ref.remove();
  });
});
