// ============================================================
// js/settings.js – Profile, Security (PIN), Currency Settings
// ============================================================
import { saveProfile, getProfile, clearAllData } from "./database.js?v=20260705b";
import { toast, ls, formatCurrency } from "./utils.js?v=20260705b";
import { logout } from "./firebase.js?v=20260705b";
import { setThemeColor, resetThemeColor, getThemeColor, setAppIcon, resetAppIcon } from "./theme.js?v=20260705b";
import { renderChangeLog } from "./changelog.js?v=20260705b";

export const initSettings = async () => {
  await renderProfileForm();
  bindSecurityEvents();
  bindImportExportEvents();
  bindNotificationEvents();
  bindDangerZone();
  bindAppearanceEvents();
  renderChangeLog();
};

// ─── NOTIFICATIONS (reminder preferences) ─────────────────────
const bindNotificationEvents = () => {
  const itrInput = document.getElementById("setting-itr-days");
  const reviewInput = document.getElementById("setting-review-day");
  itrInput.value = ls.get("itr_reminder_days", 60);
  reviewInput.value = ls.get("review_reminder_day", 1);

  document.getElementById("btn-save-notifications").addEventListener("click", () => {
    ls.set("itr_reminder_days", parseInt(itrInput.value) || 60);
    ls.set("review_reminder_day", parseInt(reviewInput.value) || 1);
    toast("Notification preferences saved", "success");
    window.dispatchEvent(new Event("data:changed"));
  });
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
  document.getElementById("btn-import-json").addEventListener("click", () => {
    importMode = "json";
    fileInput.accept = ".json";
    fileInput.click();
  });

  fileInput.addEventListener("change", async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const { importZerodhaFile } = await import("./import.js?v=20260705b");
    const { restoreFromJSON } = await import("./export.js?v=20260705b");

    if (importMode === "zerodha") importZerodhaFile(file);
    else if (importMode === "json") restoreFromJSON(file);

    fileInput.value = "";
  });

  document.getElementById("btn-export-excel").addEventListener("click", async () => {
    const { exportToExcel } = await import("./export.js?v=20260705b");
    exportToExcel();
  });

  document.getElementById("btn-export-json").addEventListener("click", async () => {
    const { exportToJSON } = await import("./export.js?v=20260705b");
    exportToJSON();
  });
};

// ─── APPEARANCE (Theme color wheel + App Icon) ────────────────
const bindAppearanceEvents = () => {
  const wheel = document.getElementById("theme-color-wheel");
  wheel.value = getThemeColor();
  wheel.addEventListener("input", () => setThemeColor(wheel.value));
  wheel.addEventListener("change", () => toast("Theme color updated", "success"));

  document.getElementById("btn-theme-reset").addEventListener("click", () => {
    resetThemeColor();
    wheel.value = "#5a6e3a";
    toast("Reverted to default Olive theme", "success");
  });

  // Custom app icon
  const iconInput = document.getElementById("app-icon-upload");
  const preview = document.getElementById("app-icon-preview");
  const storedIcon = ls.get("app_icon_data");
  if (storedIcon) preview.innerHTML = `<img src="${storedIcon}" alt="App icon" />`;

  document.getElementById("btn-upload-icon").addEventListener("click", () => iconInput.click());

  iconInput.addEventListener("change", () => {
    const file = iconInput.files[0];
    if (!file) return;
    if (file.size > 1024 * 1024) {
      toast("Please choose an image under 1MB", "error");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setAppIcon(reader.result);
      preview.innerHTML = `<img src="${reader.result}" alt="App icon" />`;
      toast("App icon updated", "success");
    };
    reader.onerror = () => toast("Couldn't read that image file", "error");
    reader.readAsDataURL(file);
    iconInput.value = "";
  });

  document.getElementById("btn-reset-icon").addEventListener("click", () => {
    resetAppIcon();
    preview.innerHTML = `<i data-lucide="image"></i>`;
    lucide.createIcons();
    toast("App icon reset to default", "success");
  });
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

    const btn = document.getElementById("btn-clear-data");
    if (btn.disabled) return; // guard against double-click races
    btn.disabled = true;
    const originalLabel = btn.textContent;
    btn.textContent = "Deleting…";

    try {
      const result = await clearAllData();
      toast(`All data cleared (${result.deletedCount} items removed)`, "success");
      setTimeout(() => location.reload(), 1000);
    } catch (err) {
      if (err.partial) {
        toast(`Cleared ${err.deletedCount} items, but some failed to delete. Try again.`, "warning");
      } else {
        toast("Couldn't clear data: " + err.message, "error");
      }
      btn.disabled = false;
      btn.textContent = originalLabel;
      console.error(err);
    }
  });
};
