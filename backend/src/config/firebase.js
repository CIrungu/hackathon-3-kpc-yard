import admin from "firebase-admin";
import env from "./env.js";
import { createMemoryStore } from "../services/memoryStore.js";

const hasCredentials =
  env.firebase.projectId &&
  env.firebase.clientEmail &&
  env.firebase.privateKey &&
  !env.firebase.emulatorMode;

let db = null;
let app = null;

if (hasCredentials) {
  app = admin.initializeApp({
    credential: admin.credential.cert({
      type: env.firebase.type,
      projectId: env.firebase.projectId,
      privateKey: env.firebase.privateKey,
      clientEmail: env.firebase.clientEmail,
    }),
    databaseURL: env.firebase.databaseURL,
  });
  db = admin.database();
  console.log("[firebase] Initialized Firebase Admin (RTDB)");
} else {
  db = createMemoryStore();
  console.log("[firebase] No credentials found — running on in-memory emulator store.");
}

/**
 * Create a namespaced ref backed by either the Firebase Realtime Database or
 * the in-memory emulator store. Signatures mirror the RTDB ref API subset we use.
 * @param {string} path e.g. "yard/trucks"
 */
export function ref(path) {
  return db.ref(path);
}

export function serverTimestamp() {
  return admin.database.ServerValue?.TIMESTAMP ?? Date.now();
}

export { app, db };

export function isEmulator() {
  return !hasCredentials;
}