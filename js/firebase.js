// ============================================================
// js/firebase.js  – Firebase Init & Auth
// ============================================================
// SETUP: Replace the firebaseConfig object below with your own
// project credentials from https://console.firebase.google.com
// ============================================================

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signInAnonymously,
  signOut,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import {
  getFirestore,
  doc, collection,
  setDoc, addDoc, getDoc, getDocs,
  updateDoc, deleteDoc,
  query, where, orderBy, limit, onSnapshot,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

// ─── YOUR FIREBASE CONFIG ───────────────────────────────────
// Get this from: Firebase Console → Project Settings → Your Apps → SDK snippet
const firebaseConfig = {
  apiKey:            "AIzaSyCfS59K-LYm_zXrWJEYVQ9IRID4al0wkws",
  authDomain:        "capitalone-finance.firebaseapp.com",
  projectId:         "capitalone-finance",
  storageBucket:     "capitalone-finance.firebasestorage.app",
  messagingSenderId: "344388986779",
  appId:             "1:344388986779:web:5e7d410c49842e2e5fe33e"
};
// ────────────────────────────────────────────────────────────

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db   = getFirestore(app);
export const googleProvider = new GoogleAuthProvider();

// Auth helpers
export const loginWithGoogle = () => signInWithPopup(auth, googleProvider);
export const loginAnonymously = () => signInAnonymously(auth);
export const logout = () => signOut(auth);
export const onAuth = (cb) => onAuthStateChanged(auth, cb);

// Firestore helpers
export {
  doc, collection,
  setDoc, addDoc, getDoc, getDocs,
  updateDoc, deleteDoc,
  query, where, orderBy, limit, onSnapshot,
  serverTimestamp
};

// ─── Firestore path helpers ──────────────────────────────────
// All user data lives under /users/{uid}/...
export const userCol = (uid, col) => collection(db, "users", uid, col);
export const userDoc = (uid, col, id) => doc(db, "users", uid, col, id);
export const profileDoc = (uid) => doc(db, "users", uid, "profile", "data");
