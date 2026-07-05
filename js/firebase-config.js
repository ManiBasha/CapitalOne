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
  apiKey:            "AIzaSyCfS59K-LYm_zXrWJEYVQ9IRID4al0wkws",
  authDomain:        "capitalone-finance.firebaseapp.com",
  projectId:         "capitalone-finance",
  storageBucket:     "capitalone-finance.firebasestorage.app",
  messagingSenderId: "344388986779",
  appId:             "1:344388986779:web:5e7d410c49842e2e5fe33e"
};

// Used to detect an unconfigured project and show a clear setup banner
// instead of failing silently
export const isFirebaseConfigured = () =>
  firebaseConfig.apiKey && firebaseConfig.apiKey !== "AIzaSyCfS59K-LYm_zXrWJEYVQ9IRID4al0wkws" &&
  firebaseConfig.projectId && firebaseConfig.projectId !== "capitalone-finance";
