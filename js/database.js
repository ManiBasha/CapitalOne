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
} from "./firebase.js?v=20260707a";

const uid = () => auth.currentUser?.uid;

// ─── PROFILE ─────────────────────────────────────────────────
export const saveProfile = async (data) => {
  await setDoc(profileDoc(uid()), { ...data, updatedAt: serverTimestamp() }, { merge: true });
};

export const getProfile = async () => {
  const snap = await getDoc(profileDoc(uid()));
  return snap.exists() ? snap.data() : null;
};

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

// ─── BUY LOTS (stored as sub-docs under each investment) ──────
// Every purchase — the first buy and every "buy more" — is kept as its own
// dated lot. The parent investment doc's quantity/avgPrice are a recomputed
// summary (weighted average) so the holding always shows as ONE row, while
// the full purchase history remains inspectable.
export const addBuyLot = async (investmentId, buy) => {
  const ref = doc(collection(db, "users", uid(), "investments", investmentId, "buys"));
  await setDoc(ref, { ...buy, createdAt: serverTimestamp() });
  return ref.id;
};

export const getBuyLots = async (investmentId) => {
  const snap = await getDocs(collection(db, "users", uid(), "investments", investmentId, "buys"));
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
};

export const deleteBuyLot = async (investmentId, buyId) => {
  await deleteDoc(doc(db, "users", uid(), "investments", investmentId, "buys", buyId));
};

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

// ─── GOAL CONTRIBUTIONS (history of adds/removals, not just overwriting currentAmount) ──
export const addGoalContribution = async (goalId, contribution) => {
  const ref = doc(collection(db, "users", uid(), "goals", goalId, "contributions"));
  await setDoc(ref, { ...contribution, createdAt: serverTimestamp() });
  return ref.id;
};

export const getGoalContributions = async (goalId) => {
  const snap = await getDocs(collection(db, "users", uid(), "goals", goalId, "contributions"));
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
};

export const updateGoalContribution = async (goalId, contributionId, data) => {
  await setDoc(doc(db, "users", uid(), "goals", goalId, "contributions", contributionId), data, { merge: true });
};

export const deleteGoalContribution = async (goalId, contributionId) => {
  await deleteDoc(doc(db, "users", uid(), "goals", goalId, "contributions", contributionId));
};

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
  const collections = ["investments", "goals", "assets", "liabilities"];
  const data = {};
  for (const col of collections) {
    const snap = await getDocs(collection(db, "users", u, col));
    const docs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    if (col === "investments") {
      for (const inv of docs) {
        const sellsSnap = await getDocs(collection(db, "users", u, col, inv.id, "sells"));
        inv._sells = sellsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
        const buysSnap = await getDocs(collection(db, "users", u, col, inv.id, "buys"));
        inv._buys = buysSnap.docs.map(d => ({ id: d.id, ...d.data() }));
      }
    }
    if (col === "goals") {
      for (const g of docs) {
        const contribSnap = await getDocs(collection(db, "users", u, col, g.id, "contributions"));
        g._contributions = contribSnap.docs.map(d => ({ id: d.id, ...d.data() }));
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
  const writeable = ["investments", "goals", "assets", "liabilities"];
  for (const col of writeable) {
    if (!data[col]) continue;
    for (const item of data[col]) {
      const { id, createdAt, updatedAt, _sells, _buys, _contributions, ...rest } = item;
      const newId = id || doc(collection(db, "users", u, col)).id;
      await setDoc(doc(db, "users", u, col, newId), rest);
      if (col === "investments") {
        for (const sell of (_sells || [])) {
          const { id: sellId, ...sellRest } = sell;
          await setDoc(doc(db, "users", u, col, newId, "sells", sellId || doc(collection(db, "users", u, col, newId, "sells")).id), sellRest);
        }
        for (const buy of (_buys || [])) {
          const { id: buyId, ...buyRest } = buy;
          await setDoc(doc(db, "users", u, col, newId, "buys", buyId || doc(collection(db, "users", u, col, newId, "buys")).id), buyRest);
        }
      }
      if (col === "goals") {
        for (const c of (_contributions || [])) {
          const { id: cId, ...cRest } = c;
          await setDoc(doc(db, "users", u, col, newId, "contributions", cId || doc(collection(db, "users", u, col, newId, "contributions")).id), cRest);
        }
      }
    }
  }
};

// ─── CLEAR ALL DATA ──────────────────────────────────────────
export const clearAllData = async () => {
  const u = uid();
  if (!u) throw new Error("Not signed in");
  const cols = ["investments", "goals", "assets", "liabilities"];
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

    if (col === "investments") {
      for (const invDoc of snap.docs) {
        for (const sub of ["sells", "buys"]) {
          try {
            const subSnap = await getDocs(collection(db, "users", u, "investments", invDoc.id, sub));
            const subResults = await Promise.allSettled(subSnap.docs.map(d => deleteDoc(d.ref)));
            subResults.forEach(r => { if (r.status === "rejected") errors.push(`${sub}: ${r.reason?.message||r.reason}`); });
          } catch (err) {
            errors.push(`${col}/${invDoc.id}/${sub}: ${err.message}`);
          }
        }
      }
    }
    if (col === "goals") {
      for (const goalDoc of snap.docs) {
        try {
          const subSnap = await getDocs(collection(db, "users", u, "goals", goalDoc.id, "contributions"));
          const subResults = await Promise.allSettled(subSnap.docs.map(d => deleteDoc(d.ref)));
          subResults.forEach(r => { if (r.status === "rejected") errors.push(`contributions: ${r.reason?.message||r.reason}`); });
        } catch (err) {
          errors.push(`${col}/${goalDoc.id}/contributions: ${err.message}`);
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
