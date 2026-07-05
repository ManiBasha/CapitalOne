// ============================================================
// js/firebase-config.js  – YOUR Firebase project credentials
// ============================================================
// IMPORTANT: This file is intentionally separate from firebase.js.
// Future code updates / AI-generated changes should NEVER need to
// touch this file — so your real keys are never overwritten again.
//
// Fill this in ONCE from:
// Firebase Console → Project Settings → General → Your apps → SDK snippet
// ============================================================

export const firebaseConfig = {
  apiKey:            "YOUR_API_KEY",
  authDomain:        "YOUR_PROJECT_ID.firebaseapp.com",
  projectId:         "YOUR_PROJECT_ID",
  storageBucket:     "YOUR_PROJECT_ID.appspot.com",
  messagingSenderId: "YOUR_MESSAGING_SENDER_ID",
  appId:             "YOUR_APP_ID"
};

// Used to detect an unconfigured project and show a clear setup banner
// instead of failing silently.
export const isFirebaseConfigured = () =>
  firebaseConfig.apiKey && firebaseConfig.apiKey !== "YOUR_API_KEY" &&
  firebaseConfig.projectId && firebaseConfig.projectId !== "YOUR_PROJECT_ID";
