// ============================================================
// js/config.js – App-wide configuration constants
// ============================================================

export const APP_NAME = "CapitalOne";

export const SUPPORTED_CURRENCIES = ["INR", "SAR", "USD", "AED", "GBP", "EUR"];

export const DEFAULT_BASE_CURRENCY = "INR";
export const DEFAULT_DISPLAY_CURRENCY = "SAR";

// Free exchange rate API (no key required)
export const EXCHANGE_RATE_API = "https://api.exchangerate.host/latest";

// PIN lock auto-timeout (minutes of inactivity before re-lock)
export const PIN_AUTO_LOCK_MINUTES = 5;

// Pagination
export const TRANSACTIONS_PAGE_SIZE = 30;

// Chart color palette (Olive theme)
export const CHART_PALETTE = [
  "#5a6e3a", "#7a9a4a", "#a8b887", "#b8962e", "#8b6347",
  "#4a5c2e", "#c8d8a0", "#d4a853", "#6b7280", "#10b981"
];

// Financial years available in Tax Calculator
export const FINANCIAL_YEARS = ["2024-25", "2025-26", "2026-27"];
