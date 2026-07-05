// ============================================================
// js/database.js  – All Firestore CRUD operations
// ============================================================
import {
  db, auth,
  doc, collection, userCol, userDoc, profileDoc,
  setDoc, addDoc, getDoc, getDocs,
  updateDoc, deleteDoc,
  query, where, orderBy, limit, onSnapshot,
  serverTimestamp
} from "./firebase.js?v=20260705a";

const uid = () => auth.currentUser?.uid;

// ─── PROFILE ─────────────────────────────────────────────────
export const saveProfile = async (data) => {
  await setDoc(profileDoc(uid()), { ...data, updatedAt: serverTimestamp() }, { merge: true });
};

export const getProfile = async () => {
  const snap = await getDoc(profileDoc(uid()));
  return snap.exists() ? snap.data() : null;
};

// ─── TRANSACTIONS ─────────────────────────────────────────────
export const addTransaction = async (txn) => {
  return await addDoc(userCol(uid(), "transactions"), {
    ...txn,
    createdAt: serverTimestamp()
  });
};

export const updateTransaction = async (id, data) => {
  await updateDoc(userDoc(uid(), "transactions", id), { ...data, updatedAt: serverTimestamp() });
};

export const deleteTransaction = async (id) => {
  await deleteDoc(userDoc(uid(), "transactions", id));
};

export const getTransactions = async (filters = {}) => {
  let q = collection(db, "users", uid(), "transactions");
  const constraints = [orderBy("date", "desc")];
  if (filters.type) constraints.push(where("type", "==", filters.type));
  if (filters.account) constraints.push(where("accountId", "==", filters.account));
  if (filters.fromDate) constraints.push(where("date", ">=", filters.fromDate));
  if (filters.toDate) constraints.push(where("date", "<=", filters.toDate));
  const snap = await getDocs(query(q, ...constraints));
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
};

export const subscribeTransactions = (callback, lim = 50) => {
  const q = query(
    collection(db, "users", uid(), "transactions"),
    orderBy("date", "desc"),
    limit(lim)
  );
  return onSnapshot(q, snap => {
    callback(snap.docs.map(d => ({ id: d.id, ...d.data() })));
  });
};

// ─── ACCOUNTS ─────────────────────────────────────────────────
export const saveAccount = async (id, data) => {
  const ref = id ? userDoc(uid(), "accounts", id) : doc(userCol(uid(), "accounts"));
  await setDoc(ref, { ...data, updatedAt: serverTimestamp() }, { merge: true });
  return ref.id;
};

export const getAccounts = async () => {
  const snap = await getDocs(userCol(uid(), "accounts"));
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
};

export const deleteAccount = async (id) => deleteDoc(userDoc(uid(), "accounts", id));

// ─── CATEGORIES ───────────────────────────────────────────────
export const saveCategory = async (id, data) => {
  const ref = id ? userDoc(uid(), "categories", id) : doc(userCol(uid(), "categories"));
  await setDoc(ref, { ...data, updatedAt: serverTimestamp() }, { merge: true });
  return ref.id;
};

export const getCategories = async () => {
  const snap = await getDocs(userCol(uid(), "categories"));
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
};

export const deleteCategory = async (id) => deleteDoc(userDoc(uid(), "categories", id));

// ─── BUDGETS ──────────────────────────────────────────────────
export const saveBudget = async (id, data) => {
  const ref = id ? userDoc(uid(), "budgets", id) : doc(userCol(uid(), "budgets"));
  await setDoc(ref, { ...data, updatedAt: serverTimestamp() }, { merge: true });
  return ref.id;
};

export const getBudgets = async () => {
  const snap = await getDocs(userCol(uid(), "budgets"));
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
};

export const deleteBudget = async (id) => deleteDoc(userDoc(uid(), "budgets", id));

// ─── INVESTMENTS ──────────────────────────────────────────────
export const saveInvestment = async (id, data) => {
  const ref = id ? userDoc(uid(), "investments", id) : doc(userCol(uid(), "investments"));
  await setDoc(ref, { ...data, updatedAt: serverTimestamp() }, { merge: true });
  return ref.id;
};

export const getInvestments = async () => {
  const snap = await getDocs(userCol(uid(), "investments"));
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
};

export const deleteInvestment = async (id) => deleteDoc(userDoc(uid(), "investments", id));

// ─── SELL TRADES (stored as sub-docs under each investment) ──
export const addSellTrade = async (investmentId, sell) => {
  const ref = doc(collection(db, "users", uid(), "investments", investmentId, "sells"));
  await setDoc(ref, { ...sell, createdAt: serverTimestamp() });
  return ref.id;
};

export const getSellTrades = async (investmentId) => {
  const snap = await getDocs(collection(db, "users", uid(), "investments", investmentId, "sells"));
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
};

export const deleteSellTrade = async (investmentId, sellId) => {
  await deleteDoc(doc(db, "users", uid(), "investments", investmentId, "sells", sellId));
};

// ─── GOALS ────────────────────────────────────────────────────
export const saveGoal = async (id, data) => {
  const ref = id ? userDoc(uid(), "goals", id) : doc(userCol(uid(), "goals"));
  await setDoc(ref, { ...data, updatedAt: serverTimestamp() }, { merge: true });
  return ref.id;
};

export const getGoals = async () => {
  const snap = await getDocs(userCol(uid(), "goals"));
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
};

export const deleteGoal = async (id) => deleteDoc(userDoc(uid(), "goals", id));

// ─── ASSETS & LIABILITIES ────────────────────────────────────
export const saveAsset = async (id, data) => {
  const ref = id ? userDoc(uid(), "assets", id) : doc(userCol(uid(), "assets"));
  await setDoc(ref, { ...data, updatedAt: serverTimestamp() }, { merge: true });
  return ref.id;
};
export const getAssets = async () => {
  const snap = await getDocs(userCol(uid(), "assets"));
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
};
export const deleteAsset = async (id) => deleteDoc(userDoc(uid(), "assets", id));

export const saveLiability = async (id, data) => {
  const ref = id ? userDoc(uid(), "liabilities", id) : doc(userCol(uid(), "liabilities"));
  await setDoc(ref, { ...data, updatedAt: serverTimestamp() }, { merge: true });
  return ref.id;
};
export const getLiabilities = async () => {
  const snap = await getDocs(userCol(uid(), "liabilities"));
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
};
export const deleteLiability = async (id) => deleteDoc(userDoc(uid(), "liabilities", id));

// ─── FULL BACKUP / RESTORE ───────────────────────────────────
export const exportAllData = async () => {
  const u = uid();
  const collections = ["transactions","accounts","categories","budgets","investments","goals","assets","liabilities"];
  const data = {};
  for (const col of collections) {
    const snap = await getDocs(collection(db, "users", u, col));
    const docs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    // Also export sell trades for each investment
    if (col === "investments") {
      for (const inv of docs) {
        const sellsSnap = await getDocs(collection(db, "users", u, "investments", inv.id, "sells"));
        inv._sells = sellsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
      }
    }
    data[col] = docs;
  }
  const profileSnap = await getDoc(profileDoc(u));
  data.profile = profileSnap.exists() ? profileSnap.data() : {};
  return data;
};

export const importAllData = async (data) => {
  const u = uid();
  if (data.profile) await saveProfile(data.profile);
  const writeable = ["accounts","categories","budgets","investments","goals","assets","liabilities","transactions"];
  for (const col of writeable) {
    if (!data[col]) continue;
    for (const item of data[col]) {
      const { id, createdAt, updatedAt, ...rest } = item;
      await setDoc(doc(db, "users", u, col, id || doc(collection(db, "users", u, col)).id), rest);
    }
  }
};

// ─── CLEAR ALL DATA ──────────────────────────────────────────
// Deletes every collection AND the "sells" sub-collection nested under each
// investment doc (previously orphaned — the reason clear-all sometimes
// looked "stuck" when investments with sell history remained visible).
// Uses Promise.allSettled per collection so one failure doesn't silently
// abort the rest, and returns a report so the caller can show real errors.
export const clearAllData = async () => {
  const u = uid();
  if (!u) throw new Error("Not signed in");
  const cols = ["transactions","accounts","categories","budgets","investments","goals","assets","liabilities"];
  const errors = [];
  let deletedCount = 0;

  for (const col of cols) {
    let snap;
    try {
      snap = await getDocs(collection(db, "users", u, col));
    } catch (err) {
      errors.push(`${col}: ${err.message}`);
      continue;
    }

    // Delete nested "sells" sub-docs first for investments
    if (col === "investments") {
      for (const invDoc of snap.docs) {
        try {
          const sellsSnap = await getDocs(collection(db, "users", u, "investments", invDoc.id, "sells"));
          const sellResults = await Promise.allSettled(sellsSnap.docs.map(d => deleteDoc(d.ref)));
          sellResults.forEach(r => { if (r.status === "rejected") errors.push(`sells: ${r.reason?.message||r.reason}`); });
        } catch (err) {
          errors.push(`${col}/${invDoc.id}/sells: ${err.message}`);
        }
      }
    }

    const results = await Promise.allSettled(snap.docs.map(d => deleteDoc(d.ref)));
    results.forEach(r => {
      if (r.status === "fulfilled") deletedCount++;
      else errors.push(`${col}: ${r.reason?.message || r.reason}`);
    });
  }

  window.dispatchEvent(new Event("data:changed"));

  if (errors.length) {
    console.error("clearAllData completed with errors:", errors);
    const e = new Error(`Deleted ${deletedCount} items, but ${errors.length} failed. Check console for details.`);
    e.partial = true;
    e.deletedCount = deletedCount;
    e.errors = errors;
    throw e;
  }
  return { deletedCount };
};
