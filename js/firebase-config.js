// ============================================================
// js/firebase-config.js  – YOUR Firebase project credentials
// ============================================================

export const firebaseConfig = {
  apiKey:            "AIzaSyCfS59K-LYm_zXrWJEYVQ9IRID4al0wkws",
  authDomain:        "capitalone-finance.firebaseapp.com",
  projectId:         "capitalone-finance",
  storageBucket:     "capitalone-finance.firebasestorage.app",
  messagingSenderId: "344388986779",
  appId:             "1:344388986779:web:5e7d410c49842e2e5fe33e"
};

export const isFirebaseConfigured = () =>
  firebaseConfig.apiKey && firebaseConfig.apiKey !== "YOUR_API_KEY" &&
  firebaseConfig.projectId && firebaseConfig.projectId !== "YOUR_PROJECT_ID";
