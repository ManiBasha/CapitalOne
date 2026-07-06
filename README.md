# CapitalOne – Complete Finance App

A premium personal finance dashboard for INR — investment tracking, goals, Indian income tax calculator.

## ✅ Features Implemented

- Google Sign-In + Anonymous mode (Firebase Auth)
- First-time setup wizard (profile, financial basics, preferences)
- Portfolio dashboard: Net Worth, Cash Flow, Investment Summary
- Wealth page: Assets, Liabilities, Net Worth timeline & allocation charts
- Money page: Transactions (filters/search/pagination), Accounts, Budgets, Categories
- Investments page: Equity / Mutual Funds / Gold / Crypto / FD-PPF-EPF tabs, charts
- Goals page: progress bars, required SIP calculation
- Income Tax Calculator: Old vs New regime (FY 2025–26 slabs), compare mode
- Settings: profile editing, 4-digit PIN app lock, currency & exchange rates
- Import: Zerodha Holdings XLS, Cashew CSV (auto-creates accounts/categories, detects duplicates via ISIN)
- Export: Excel (.xlsx), JSON full backup/restore
- Multi-currency: INR / SAR / USD / AED / GBP / EUR, live exchange rates
- Dark/Light theme toggle (Olive Green premium design)
- Fully responsive (desktop, tablet, mobile) with collapsible sidebar
- Global search, notifications panel, toast messages

---

## 🔒 Security Notes

- Each user's data is encrypted and stored.
- The 4-digit PIN lock is a **local UX convenience** (stored in browser `localStorage`). it does not encrypt Firestore data.

---

## 🛠 Customization

- **Colors**: edit CSS variables in `css/theme.css`
- **Tax slabs**: update slab tables in `js/tax.js` when new Budget/FY rates are announced

---

Built with vanilla HTML/CSS/JS + Firebase.
