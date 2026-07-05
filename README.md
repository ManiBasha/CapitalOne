# CapitalOne – Complete Finance App

A premium personal finance dashboard for INR & SAR users — investment tracking, budgeting, cash flow, goals, Indian income tax calculator, and Excel imports. Runs entirely free on **GitHub Pages** + **Firebase (Spark/free plan)**.

---

## 🔧 1. Firebase Setup (required)

1. Go to **https://console.firebase.google.com** → **Add project** → name it (e.g. `capitalone-finance`).
2. **Build → Authentication → Get started**
   - Enable **Google** sign-in provider (toggle on, set support email, save).
   - Enable **Anonymous** sign-in provider too (for "Try without account").
3. **Build → Firestore Database → Create database**
   - Choose **Production mode**, pick a region close to your users (e.g. `asia-south1` for India or `me-central1` for Saudi).
4. Go to **Project Settings (gear icon) → General → Your apps → Add app → Web (</>)**.
   - Register app name `CapitalOne`.
   - Copy the `firebaseConfig` object shown.
5. Open `js/firebase.js` in this project and replace the placeholder `firebaseConfig` values with your real keys:

```js
const firebaseConfig = {
  apiKey:            "AIza...",
  authDomain:        "capitalone-finance.firebaseapp.com",
  projectId:         "capitalone-finance",
  storageBucket:     "capitalone-finance.appspot.com",
  messagingSenderId: "1234567890",
  appId:             "1:1234567890:web:abcdef"
};
```

6. **Authentication → Settings → Authorized domains** — add your GitHub Pages domain, e.g. `yourusername.github.io`.

7. **Firestore → Rules** tab — paste the contents of `firestore.rules` (included in this repo) and click **Publish**:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /users/{userId}/{document=**} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }
  }
}
```

This ensures each signed-in user can only access their **own** data.

---

## 🚀 2. Deploy to GitHub Pages

1. Create a new GitHub repository (e.g. `capitalone-finance`).
2. Push all files in this folder to the repo root:

```bash
git init
git add .
git commit -m "Initial commit – CapitalOne Finance App"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/capitalone-finance.git
git push -u origin main
```

3. On GitHub: **Settings → Pages → Source → Deploy from branch → `main` / `root`** → Save.
4. Your app will be live at:
   `https://YOUR_USERNAME.github.io/capitalone-finance/`
5. Go back to Firebase **Authentication → Settings → Authorized domains** and add this exact domain.

---

## 🔑 3. APIs Used (all free, no backend server needed)

| Purpose | Service | Notes |
|---|---|---|
| Auth (Google + Anonymous login) | **Firebase Authentication** | Free Spark plan |
| Database | **Firebase Firestore** | Free Spark plan (1 GiB storage, 50K reads/day) |
| Currency Exchange Rates | **exchangerate.host** (`https://api.exchangerate.host/latest`) | Free, no API key required |
| Charts | **Chart.js** (CDN) | No key required |
| Excel/CSV parsing | **SheetJS (xlsx)** (CDN) | No key required |
| Icons | **Lucide Icons** (CDN) | No key required |
| Fonts | **Google Fonts – Inter** | No key required |

No paid APIs or backend servers are required — the entire app is static HTML/CSS/JS calling Firebase + free public APIs directly from the browser.

---

## 📁 Project Structure

```
capitalOne/
├── index.html              Main app shell (all pages, modals)
├── firestore.rules         Firestore security rules
├── css/
│   ├── theme.css           Color tokens (light/dark olive theme)
│   └── style.css           All component styles
└── js/
    ├── firebase.js         Firebase init + auth helpers   ← ADD YOUR CONFIG HERE
    ├── database.js         All Firestore CRUD operations
    ├── config.js            App-wide constants
    ├── utils.js             Currency, date, toast, modal helpers
    ├── app.js                Main orchestration: nav, auth flow, PIN lock
    ├── setup.js              First-time onboarding wizard
    ├── transactions.js       Transaction list, add/edit modal, filters
    ├── money.js               Accounts, Categories, Budgets, Insights
    ├── wealth.js               Assets, Liabilities, Net Worth
    ├── investments.js          Investment holdings CRUD + tables
    ├── goals.js                 Financial goals tracker
    ├── tax.js                    Indian Income Tax Calculator (Old/New regime)
    ├── charts.js                  Chart.js rendering (all charts)
    ├── import.js                   Zerodha XLS + Cashew CSV importers
    ├── export.js                    Excel/JSON export, backup & restore
    └── settings.js                   Profile, PIN lock, currency settings
```

---

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

- Each user's data is isolated under `/users/{uid}/...` in Firestore, enforced by `firestore.rules`.
- The 4-digit PIN lock is a **local UX convenience** (stored in browser `localStorage`), not a substitute for Firebase Auth security — it does not encrypt Firestore data.
- For production use with real financial data, consider enabling Firebase **App Check** and reviewing Firestore quota/billing alerts.

---

## 🛠 Customization

- **Colors**: edit CSS variables in `css/theme.css` (`--c-primary`, `--c-accent`, etc.)
- **Default categories**: edit `DEFAULT_CATEGORIES` in `js/utils.js`
- **Tax slabs**: update slab tables in `js/tax.js` when new Budget/FY rates are announced
- **Exchange rate base**: change default in `js/config.js` (`DEFAULT_BASE_CURRENCY`)

---

Built with vanilla HTML/CSS/JS + Firebase — zero build step, zero hosting cost.
