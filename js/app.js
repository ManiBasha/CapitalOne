// ============================================================
// js/app.js – Main App Orchestration
// ============================================================
import { auth, onAuth, loginWithGoogle, loginAnonymously, logout } from "./firebase.js?v=20260705a";
import { getProfile } from "./database.js?v=20260705a";
import { initSetup } from "./setup.js?v=20260705a";
import { initInvestments, getInvestmentsData, aggregateInvestments, openInvModal } from "./investments.js?v=20260705a";
import { initWealth, getWealthData } from "./wealth.js?v=20260705a";
import { initGoals, openGoalModal, getGoalsData } from "./goals.js?v=20260705a";
import { initTax } from "./tax.js?v=20260705a";
import { initSettings } from "./settings.js?v=20260705a";
import { refreshDashboard, bindDashboardQuickActions } from "./dashboard.js?v=20260705a";
import { refreshChartTheme } from "./charts.js?v=20260705a";
import { initThemeEngine, applyThemeVars, applyStoredAppIcon } from "./theme.js?v=20260705a";
import {
  formatCurrency, convertCurrency, toast, ls, debounce,
  fetchExchangeRates, exchangeRates
} from "./utils.js?v=20260705a";

// Apply any previously saved custom theme color / app icon immediately,
// before auth resolves, so there's no flash of the default palette.
initThemeEngine();
applyStoredAppIcon();

// ============================================================
// AUTH FLOW
// ============================================================
document.getElementById("btn-google-login").addEventListener("click", async () => {
  try { await loginWithGoogle(); }
  catch (err) { toast("Sign-in failed: " + err.message, "error"); console.error(err); }
});

document.getElementById("btn-anon-login").addEventListener("click", async () => {
  try { await loginAnonymously(); }
  catch (err) { toast("Sign-in failed: " + err.message, "error"); console.error(err); }
});

onAuth(async (user) => {
  if (!user) {
    document.getElementById("auth-screen").classList.remove("hidden");
    document.getElementById("setup-screen").classList.add("hidden");
    document.getElementById("app").classList.add("hidden");
    document.getElementById("pin-screen").classList.add("hidden");
    return;
  }

  document.getElementById("auth-screen").classList.add("hidden");

  // Populate sidebar profile
  document.getElementById("user-avatar").innerHTML = user.photoURL
    ? `<img src="${user.photoURL}" alt="${user.displayName||'User'}" />`
    : (user.displayName?.[0] || "U");
  document.getElementById("user-avatar-mobile").innerHTML = user.photoURL
    ? `<img src="${user.photoURL}" alt="${user.displayName||'User'}" />`
    : (user.displayName?.[0] || "U");
  document.getElementById("user-name").textContent = user.displayName || (user.isAnonymous ? "Guest User" : "User");
  document.getElementById("user-email").textContent = user.email || (user.isAnonymous ? "Anonymous session" : "");

  // Check PIN lock
  if (ls.get("pin_enabled", false)) {
    showPinScreen();
    return;
  }

  await proceedToApp();
});

const proceedToApp = async () => {
  let profile;
  try {
    profile = await getProfile();
  } catch (err) {
    console.error("Failed to load profile:", err);
    toast("Couldn't connect to the database. Check Firestore rules are published, then reload.", "error");
    document.getElementById("auth-screen").classList.remove("hidden");
    return;
  }

  if (!profile || !profile.setupDone) {
    document.getElementById("setup-screen").classList.remove("hidden");
    initSetup();
    window.addEventListener("app:ready", initApp, { once: true });
  } else {
    if (profile.theme === "Dark") document.documentElement.setAttribute("data-theme", "dark");
    document.getElementById("app").classList.remove("hidden");
    await initApp();
  }
};

// ============================================================
// PIN LOCK SCREEN
// ============================================================
let pinBuffer = "";
const showPinScreen = () => {
  document.getElementById("pin-screen").classList.remove("hidden");
  pinBuffer = "";
  renderPinDots();
  renderPinPad();
};

const renderPinDots = () => {
  document.querySelectorAll("#pin-dots span").forEach((el, i) => {
    el.classList.toggle("filled", i < pinBuffer.length);
  });
};

const renderPinPad = () => {
  const pad = document.getElementById("pin-pad");
  const keys = ["1","2","3","4","5","6","7","8","9","","0","⌫"];
  pad.innerHTML = keys.map(k => k === "" ? `<div></div>` : `<button class="pin-btn" data-key="${k}">${k}</button>`).join("");
  pad.querySelectorAll(".pin-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      const key = btn.dataset.key;
      if (key === "⌫") { pinBuffer = pinBuffer.slice(0, -1); }
      else if (pinBuffer.length < 4) { pinBuffer += key; }
      renderPinDots();
      if (pinBuffer.length === 4) checkPin();
    });
  });
};

const checkPin = () => {
  const correctPin = ls.get("pin_code");
  if (pinBuffer === correctPin) {
    document.getElementById("pin-screen").classList.add("hidden");
    proceedToApp();
  } else {
    toast("Incorrect PIN", "error");
    pinBuffer = "";
    renderPinDots();
  }
};

document.getElementById("pin-forgot").addEventListener("click", async () => {
  if (!confirm("Sign out and reset PIN?")) return;
  ls.remove("pin_enabled");
  ls.remove("pin_code");
  await logout();
  location.reload();
});

// ============================================================
// APP INITIALIZATION
// ============================================================
let appInitialized = false;

const initApp = async () => {
  if (appInitialized) return;
  appInitialized = true;

  lucide.createIcons();

  // Load cached exchange rates first, then refresh
  const cachedRates = ls.get("exchange_rates");
  if (cachedRates) Object.assign(exchangeRates, cachedRates);
  fetchExchangeRates("INR").then(() => {
    updateRateDisplay();
  });

  bindNavigation();
  bindSidebarToggle();
  bindSidebarCollapse();
  bindProfileToSettings();
  bindBottomNav();
  bindThemeToggle();
  bindModalClose();
  bindQuickActions();
  bindSearch();
  bindNotifications();
  bindFAB();

  // Init all modules
  await initInvestments();
  await initWealth();
  await initGoals();
  initTax();
  await initSettings();

  await refreshDashboard();
  bindDashboardQuickActions();

  window.addEventListener("data:changed", debounce(refreshAllPages, 400));

  lucide.createIcons();
};

// ============================================================
// NAVIGATION
// ============================================================
const bindNavigation = () => {
  document.querySelectorAll(".nav-item").forEach(item => {
    item.addEventListener("click", (e) => {
      e.preventDefault();
      const page = item.dataset.page;
      navigateTo(page);
      closeSidebarMobile();
    });
  });
};

const navigateTo = (page) => {
  document.querySelectorAll(".nav-item").forEach(n => n.classList.toggle("active", n.dataset.page === page));
  document.querySelectorAll(".bottom-nav-item").forEach(n => n.classList.toggle("active", n.dataset.page === page));
  document.querySelectorAll(".page").forEach(p => p.classList.add("hidden"));
  document.getElementById(`page-${page}`)?.classList.remove("hidden");

  if (page === "dashboard") refreshDashboard();
  if (page === "investments") initInvestments();
  if (page === "goals") initGoals();

  lucide.createIcons();
};

// ============================================================
// PROFILE → SETTINGS (name/avatar now acts as the settings entry point)
// ============================================================
const bindProfileToSettings = () => {
  document.getElementById("sidebar-profile").addEventListener("click", () => {
    navigateTo("settings");
    closeSidebarMobile();
  });
  document.getElementById("mobile-profile-chip").addEventListener("click", () => {
    navigateTo("settings");
  });
};

// ============================================================
// DESKTOP SIDEBAR COLLAPSE (closable tabs)
// ============================================================
const bindSidebarCollapse = () => {
  const sidebar = document.getElementById("sidebar");
  const btn = document.getElementById("sidebar-collapse-btn");
  const collapsed = ls.get("sidebar_collapsed", false);
  sidebar.classList.toggle("collapsed", collapsed);

  btn.addEventListener("click", () => {
    const isCollapsed = sidebar.classList.toggle("collapsed");
    ls.set("sidebar_collapsed", isCollapsed);
    btn.setAttribute("title", isCollapsed ? "Expand sidebar" : "Collapse sidebar");
  });
};

// ============================================================
// BOTTOM NAV (mobile)
// ============================================================
const bindBottomNav = () => {
  document.querySelectorAll(".bottom-nav-item").forEach(item => {
    item.addEventListener("click", (e) => {
      e.preventDefault();
      navigateTo(item.dataset.page);
    });
  });
};

// ============================================================
// SIDEBAR (mobile)
// ============================================================
const bindSidebarToggle = () => {
  const sidebar = document.getElementById("sidebar");
  const overlay = document.getElementById("sidebar-overlay");

  document.getElementById("menu-btn").addEventListener("click", () => {
    sidebar.classList.add("open");
    overlay.classList.remove("hidden");
  });
  document.getElementById("sidebar-close").addEventListener("click", closeSidebarMobile);
  overlay.addEventListener("click", closeSidebarMobile);
};

const closeSidebarMobile = () => {
  document.getElementById("sidebar").classList.remove("open");
  document.getElementById("sidebar-overlay").classList.add("hidden");
};

// ============================================================
// THEME TOGGLE
// ============================================================
const bindThemeToggle = () => {
  document.getElementById("theme-toggle").addEventListener("click", () => {
    const html = document.documentElement;
    const isDark = html.getAttribute("data-theme") === "dark";
    html.setAttribute("data-theme", isDark ? "light" : "dark");
    document.getElementById("theme-label").textContent = isDark ? "Light" : "Dark";
    ls.set("theme_pref", isDark ? "light" : "dark");
    applyThemeVars();
    refreshChartTheme();
  });

  const savedTheme = ls.get("theme_pref");
  if (savedTheme) {
    document.documentElement.setAttribute("data-theme", savedTheme);
    document.getElementById("theme-label").textContent = savedTheme === "dark" ? "Dark" : "Light";
  }
};

// ============================================================
// MODAL CLOSE
// ============================================================
const bindModalClose = () => {
  document.getElementById("modal-close").addEventListener("click", () => {
    document.getElementById("modal-overlay").classList.add("hidden");
  });
  document.getElementById("modal-overlay").addEventListener("click", (e) => {
    if (e.target.id === "modal-overlay") document.getElementById("modal-overlay").classList.add("hidden");
  });
};

// ============================================================
// QUICK ACTIONS
// ============================================================
const bindQuickActions = () => {
  document.getElementById("qa-add-goal")?.addEventListener("click", () => openGoalModal(null));
  document.getElementById("qa-import")?.addEventListener("click", () => navigateTo("settings"));
};

const bindFAB = () => {
  document.getElementById("fab-add").addEventListener("click", () => openInvModal(null));
};

// ============================================================
// REFRESH ALL PAGES (on data:changed)
// ============================================================
const refreshAllPages = async () => {
  await refreshDashboard();
  lucide.createIcons();
};

// ============================================================
// GLOBAL SEARCH
// ============================================================
const bindSearch = () => {
  const input = document.getElementById("global-search");
  const resultsBox = document.getElementById("search-results");
  input.placeholder = "Search holdings, goals…";

  input.addEventListener("input", debounce(() => {
    const q = input.value.trim().toLowerCase();
    if (!q) { resultsBox.classList.add("hidden"); return; }

    const holdingMatches = getInvestmentsData()
      .filter(i => (i.name || "").toLowerCase().includes(q))
      .slice(0, 5)
      .map(i => ({ label: i.name, value: formatCurrency((i.currentPrice||i.avgPrice) * (i.quantity||0), i.currency||"INR") }));

    const goalMatches = getGoalsData()
      .filter(g => (g.name || "").toLowerCase().includes(q))
      .slice(0, 5)
      .map(g => ({ label: g.name, value: formatCurrency(g.targetAmount||0, g.currency||"INR") }));

    const matches = [...holdingMatches, ...goalMatches];

    if (matches.length === 0) {
      resultsBox.innerHTML = `<div class="search-result-item">No results found</div>`;
    } else {
      resultsBox.innerHTML = matches.map(m => `
        <div class="search-result-item">
          <span>${m.label}</span>
          <span style="margin-left:auto;font-weight:600">${m.value}</span>
        </div>`).join("");
    }
    resultsBox.classList.remove("hidden");
  }, 300));

  document.addEventListener("click", (e) => {
    if (!resultsBox.contains(e.target) && e.target !== input) resultsBox.classList.add("hidden");
  });
};

// ============================================================
// NOTIFICATIONS
// ============================================================
const bindNotifications = () => {
  const btn = document.getElementById("notif-btn");
  const panel = document.getElementById("notif-panel");

  btn.addEventListener("click", () => {
    panel.classList.toggle("hidden");
  });

  document.getElementById("notif-clear").addEventListener("click", () => {
    document.getElementById("notif-list").innerHTML = `<div class="empty-state"><p>No notifications</p></div>`;
    document.getElementById("notif-dot").classList.add("hidden");
  });

  document.addEventListener("click", (e) => {
    if (!panel.contains(e.target) && e.target !== btn && !btn.contains(e.target)) {
      panel.classList.add("hidden");
    }
  });
};

// ============================================================
// EXCHANGE RATE DISPLAY (topbar)
// ============================================================
const updateRateDisplay = () => {
  const el = document.getElementById("rate-display");
  if (el) el.textContent = `1 USD = ₹${(1/exchangeRates.USD).toFixed(2)}`;
};
