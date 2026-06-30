// ============================================================
// js/settings.js – Profile, Security (PIN), Currency Settings
// ============================================================
import { saveProfile, getProfile, clearAllData } from "./database.js";
import { toast, ls, fetchExchangeRates, exchangeRates, formatCurrency } from "./utils.js";
import { logout } from "./firebase.js";

export const initSettings = async () => {
  await renderProfileForm();
  bindSecurityEvents();
  bindImportExportEvents();
  bindCurrencyEvents();
  bindDangerZone();
  renderRatesDisplay();
};

// ─── PROFILE FORM ─────────────────────────────────────────────
const renderProfileForm = async () => {
  const profile = (await getProfile()) || {};
  const container = document.getElementById("profile-form");
  container.innerHTML = `
    <div class="form-row-inline">
      <div class="form-row"><label>Name</label><input id="set-name" class="input" value="${profile.name||""}" /></div>
      <div class="form-row"><label>Age</label><input type="number" id="set-age" class="input" value="${profile.age||""}" /></div>
    </div>
    <div class="form-row-inline">
      <div class="form-row"><label>Country</label><input id="set-country" class="input" value="${profile.country||""}" /></div>
      <div class="form-row"><label>Residence</label><input id="set-residence" class="input" value="${profile.residence||""}" /></div>
    </div>
    <div class="form-row"><label>Occupation</label><input id="set-occupation" class="input" value="${profile.occupation||""}" /></div>
    <div class="form-row-inline">
      <div class="form-row"><label>Monthly Salary</label><input type="number" id="set-salary" class="input" value="${profile.monthlySalary||""}" /></div>
      <div class="form-row"><label>Monthly Expenses</label><input type="number" id="set-expenses" class="input" value="${profile.monthlyExpenses||""}" /></div>
    </div>
    <div class="form-row"><label>Risk Appetite</label>
      <select id="set-risk" class="input">
        ${["Conservative","Moderate","Aggressive"].map(r=>`<option ${profile.riskAppetite===r?"selected":""}>${r}</option>`).join("")}
      </select>
    </div>`;

  document.getElementById("btn-save-profile").onclick = async () => {
    const data = {
      name: document.getElementById("set-name").value.trim(),
      age: document.getElementById("set-age").value,
      country: document.getElementById("set-country").value.trim(),
      residence: document.getElementById("set-residence").value.trim(),
      occupation: document.getElementById("set-occupation").value.trim(),
      monthlySalary: document.getElementById("set-salary").value,
      monthlyExpenses: document.getElementById("set-expenses").value,
      riskAppetite: document.getElementById("set-risk").value,
    };
    await saveProfile(data);
    toast("Profile saved", "success");
    document.getElementById("user-name").textContent = data.name || "User";
  };
};

// ─── SECURITY / PIN LOCK ──────────────────────────────────────
const bindSecurityEvents = () => {
  const pinEnabled = ls.get("pin_enabled", false);
  const toggle = document.getElementById("pin-enabled-toggle");
  toggle.checked = pinEnabled;
  document.getElementById("pin-setup-section").classList.toggle("hidden", !pinEnabled);

  toggle.addEventListener("change", () => {
    document.getElementById("pin-setup-section").classList.toggle("hidden", !toggle.checked);
    if (!toggle.checked) {
      ls.set("pin_enabled", false);
      ls.remove("pin_code");
      toast("PIN lock disabled");
    }
  });

  document.getElementById("btn-save-pin").addEventListener("click", () => {
    const pin = document.getElementById("new-pin").value;
    const confirmPin = document.getElementById("confirm-pin").value;
    if (pin.length !== 4 || !/^\d{4}$/.test(pin)) {
      toast("PIN must be exactly 4 digits", "error");
      return;
    }
    if (pin !== confirmPin) {
      toast("PINs do not match", "error");
      return;
    }
    ls.set("pin_enabled", true);
    ls.set("pin_code", pin);
    toast("PIN saved successfully", "success");
    document.getElementById("new-pin").value = "";
    document.getElementById("confirm-pin").value = "";
  });
};

// ─── IMPORT / EXPORT ───────────────────────────────────────────
const bindImportExportEvents = () => {
  const fileInput = document.getElementById("file-import");
  let importMode = null;

  document.getElementById("btn-import-zerodha").addEventListener("click", () => {
    importMode = "zerodha";
    fileInput.accept = ".xls,.xlsx";
    fileInput.click();
  });
  document.getElementById("btn-import-cashew").addEventListener("click", () => {
    importMode = "cashew";
    fileInput.accept = ".csv";
    fileInput.click();
  });
  document.getElementById("btn-import-json").addEventListener("click", () => {
    importMode = "json";
    fileInput.accept = ".json";
    fileInput.click();
  });

  fileInput.addEventListener("change", async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const { importZerodhaFile, importCashewFile } = await import("./import.js");
    const { restoreFromJSON } = await import("./export.js");

    if (importMode === "zerodha") importZerodhaFile(file);
    else if (importMode === "cashew") importCashewFile(file);
    else if (importMode === "json") restoreFromJSON(file);

    fileInput.value = "";
  });

  document.getElementById("btn-export-excel").addEventListener("click", async () => {
    const { exportToExcel } = await import("./export.js");
    exportToExcel();
  });

  document.getElementById("btn-export-json").addEventListener("click", async () => {
    const { exportToJSON } = await import("./export.js");
    exportToJSON();
  });
};

// ─── CURRENCY ────────────────────────────────────────────────
const bindCurrencyEvents = () => {
  document.getElementById("btn-refresh-rates").addEventListener("click", async () => {
    const btn = document.getElementById("btn-refresh-rates");
    btn.disabled = true;
    btn.textContent = "Refreshing…";
    const base = document.getElementById("setting-base-currency").value;
    await fetchExchangeRates(base);
    renderRatesDisplay();
    btn.disabled = false;
    btn.innerHTML = `<i data-lucide="refresh-cw"></i> Refresh Exchange Rates`;
    lucide.createIcons();
    toast("Exchange rates updated", "success");
  });
};

const renderRatesDisplay = () => {
  const el = document.getElementById("rates-display");
  if (!el) return;
  el.innerHTML = Object.entries(exchangeRates)
    .filter(([k]) => k !== "INR")
    .map(([k,v]) => `<span class="rate-chip">1 INR = ${v.toFixed(4)} ${k}</span>`).join("");
};

// ─── DANGER ZONE ──────────────────────────────────────────────
const bindDangerZone = () => {
  document.getElementById("btn-sign-out").addEventListener("click", async () => {
    if (!confirm("Sign out of CapitalOne?")) return;
    await logout();
    location.reload();
  });

  document.getElementById("btn-clear-data").addEventListener("click", async () => {
    if (!confirm("This will permanently delete ALL your financial data. Continue?")) return;
    if (!confirm("Are you absolutely sure? This cannot be undone.")) return;
    await clearAllData();
    toast("All data cleared", "success");
    setTimeout(() => location.reload(), 1000);
  });
};
