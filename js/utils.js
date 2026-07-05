// ============================================================
// js/utils.js  – Shared utilities
// ============================================================

// ─── CURRENCY ─────────────────────────────────────────────────
// Exchange rates cache (updated at runtime)
export let exchangeRates = {
  INR: 1,
  SAR: 0.0425,  // 1 INR ≈ 0.0425 SAR (~23.5 INR per SAR)
  USD: 0.0106,  // 1 INR ≈ 0.0106 USD (~94 INR per USD)
  AED: 0.0390,
  GBP: 0.0084,
  EUR: 0.0098
};

export const setExchangeRates = (rates) => {
  exchangeRates = { ...exchangeRates, ...rates };
};

export const convertCurrency = (amount, from, to) => {
  if (from === to) return amount;
  const inINR = from === "INR" ? amount : amount / (exchangeRates[from] || 1);
  return inINR * (exchangeRates[to] || 1);
};

const CURRENCY_SYMBOLS = { INR: "₹", SAR: "﷼", USD: "$", AED: "د.إ", GBP: "£", EUR: "€" };

export const formatCurrency = (amount, currency = "INR", compact = false) => {
  const sym = CURRENCY_SYMBOLS[currency] || currency + " ";
  if (compact && Math.abs(amount) >= 10000000) return sym + (amount / 10000000).toFixed(2) + " Cr";
  if (compact && Math.abs(amount) >= 100000)   return sym + (amount / 100000).toFixed(2) + " L";
  if (compact && Math.abs(amount) >= 1000)     return sym + (amount / 1000).toFixed(1) + "K";
  return sym + new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2 }).format(amount);
};

export const formatINRandSAR = (inrAmount) => ({
  inr: formatCurrency(inrAmount, "INR"),
  sar: formatCurrency(convertCurrency(inrAmount, "INR", "SAR"), "SAR")
});

// ─── DATE ─────────────────────────────────────────────────────
export const formatDate = (dateStr) => {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
};

export const todayISO = () => new Date().toISOString().split("T")[0];

export const monthStart = (offsetMonths = 0) => {
  const d = new Date();
  d.setMonth(d.getMonth() + offsetMonths, 1);
  return d.toISOString().split("T")[0];
};

export const dateRangeFor = (range) => {
  const to = todayISO();
  const d = new Date();
  switch (range) {
    case "7d":  d.setDate(d.getDate() - 7);   break;
    case "30d": d.setDate(d.getDate() - 30);  break;
    case "6m":  d.setMonth(d.getMonth() - 6); break;
    case "1y":  d.setFullYear(d.getFullYear() - 1); break;
    default:    return { from: "2000-01-01", to };
  }
  return { from: d.toISOString().split("T")[0], to };
};

// ─── NUMBERS ──────────────────────────────────────────────────
export const pct = (num, den) => den === 0 ? 0 : ((num / den) * 100);
export const sign = (n) => n >= 0 ? "+" : "";
export const clamp = (n, min, max) => Math.min(Math.max(n, min), max);

// ─── TOAST ────────────────────────────────────────────────────
export const toast = (msg, type = "info") => {
  const container = document.getElementById("toast-container");
  const el = document.createElement("div");
  el.className = `toast ${type}`;
  el.innerHTML = `<span>${msg}</span>`;
  container.appendChild(el);
  setTimeout(() => {
    el.style.opacity = "0";
    el.style.transform = "translateY(10px)";
    el.style.transition = "0.3s";
    setTimeout(() => el.remove(), 300);
  }, 3200);
};

// ─── MODAL ────────────────────────────────────────────────────
export const openModal = (title, bodyHTML, footerHTML = "") => {
  document.getElementById("modal-title").textContent = title;
  document.getElementById("modal-body").innerHTML = bodyHTML;
  document.getElementById("modal-footer").innerHTML = footerHTML;
  document.getElementById("modal-overlay").classList.remove("hidden");
};

export const closeModal = () => {
  document.getElementById("modal-overlay").classList.add("hidden");
};

// ─── DEBOUNCE ─────────────────────────────────────────────────
export const debounce = (fn, ms = 300) => {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  };
};

// ─── LOCAL STORAGE (PIN / theme / rates) ──────────────────────
export const ls = {
  get: (k, def = null) => {
    try { const v = localStorage.getItem(k); return v !== null ? JSON.parse(v) : def; }
    catch { return def; }
  },
  set: (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
  remove: (k) => { try { localStorage.removeItem(k); } catch {} }
};

// ─── CATEGORY ICON & COLOR DEFAULTS ───────────────────────────
export const DEFAULT_CATEGORIES = [
  { name: "Food & Dining",   emoji: "🍽️", color: "#ef4444" },
  { name: "Transport",       emoji: "🚗", color: "#3b82f6" },
  { name: "Shopping",        emoji: "🛍️", color: "#8b5cf6" },
  { name: "Utilities",       emoji: "⚡", color: "#f59e0b" },
  { name: "Entertainment",   emoji: "🎬", color: "#ec4899" },
  { name: "Health",          emoji: "🏥", color: "#10b981" },
  { name: "Education",       emoji: "📚", color: "#6366f1" },
  { name: "Investments",     emoji: "📈", color: "#5a6e3a" },
  { name: "Salary",          emoji: "💼", color: "#059669" },
  { name: "Freelance",       emoji: "💻", color: "#0891b2" },
  { name: "Rent",            emoji: "🏠", color: "#d97706" },
  { name: "Insurance",       emoji: "🛡️", color: "#64748b" },
  { name: "Travel",          emoji: "✈️", color: "#0284c7" },
  { name: "Gifts",           emoji: "🎁", color: "#db2777" },
  { name: "Other",           emoji: "📌", color: "#6b7280" },
];

// ─── FETCH EXCHANGE RATES (Free, keyless API) ────────────────
// Uses open.er-api.com — free, no API key, updates daily
export const fetchExchangeRates = async (base = "INR") => {
  try {
    const res = await fetch(`https://open.er-api.com/v6/latest/${base}`);
    if (!res.ok) throw new Error(`Rate API responded ${res.status}`);
    const data = await res.json();
    if (data.result === "success" && data.rates) {
      const picked = {};
      ["INR","SAR","USD","AED","GBP","EUR"].forEach(c => {
        if (data.rates[c] !== undefined) picked[c] = data.rates[c];
      });
      setExchangeRates(picked);
      ls.set("exchange_rates", picked);
      ls.set("rates_updated", Date.now());
      return picked;
    }
    throw new Error("Unexpected rate API response shape");
  } catch (e) {
    console.warn("Exchange rate fetch failed, using cached/fallback rates:", e.message);
    const cached = ls.get("exchange_rates");
    if (cached) setExchangeRates(cached);
  }
  return null;
};

// ─── GENERATE RANDOM ID ───────────────────────────────────────
export const genId = () => Math.random().toString(36).slice(2, 11);
