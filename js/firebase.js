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
  apiKey:            "YOUR_API_KEY",
  authDomain:        "YOUR_PROJECT_ID.firebaseapp.com",
  projectId:         "YOUR_PROJECT_ID",
  storageBucket:     "YOUR_PROJECT_ID.appspot.com",
  messagingSenderId: "YOUR_MESSAGING_SENDER_ID",
  appId:             "YOUR_APP_ID"
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
