// ============================================================
// js/setup.js  – First-time setup wizard
// ============================================================
import { saveProfile } from "./database.js?v=20260705b";
import { toast } from "./utils.js?v=20260705b";

const STEPS = [
  {
    title: "Tell us about yourself",
    desc: "Personalise your CapitalOne experience",
    fields: [
      { id: "name",          label: "Your Name",             type: "text",   placeholder: "Enter your name" },
      { id: "country",       label: "Country of Origin",     type: "text",   placeholder: "e.g. India" },
      { id: "residence",     label: "Current Residence",     type: "text",   placeholder: "e.g. Saudi Arabia" },
      { id: "age",           label: "Age",                   type: "number", placeholder: "30" },
      { id: "occupation",    label: "Occupation",            type: "text",   placeholder: "Software Engineer" },
      { id: "maritalStatus", label: "Marital Status",        type: "select", options: ["Single","Married","Divorced","Widowed"] },
      { id: "children",      label: "Number of Children",    type: "number", placeholder: "0" },
    ]
  },
  {
    title: "Financial basics",
    desc: "Help us understand your current financial situation",
    fields: [
      { id: "baseCurrency",      label: "Base Currency",         type: "select", options: ["INR","SAR","USD","AED","GBP","EUR"] },
      { id: "displayCurrency",   label: "Display Currency",      type: "select", options: ["INR","SAR","USD"] },
      { id: "monthlySalary",     label: "Monthly Salary (Base Currency)", type: "number", placeholder: "0" },
      { id: "monthlyExpenses",   label: "Monthly Fixed Expenses",         type: "number", placeholder: "0" },
      { id: "emergencyFund",     label: "Emergency Fund Available",       type: "number", placeholder: "0" },
      { id: "taxResidency",      label: "Tax Residency",         type: "select", options: ["India","Saudi Arabia","UAE","USA","UK","Other"] },
      { id: "financialYear",     label: "Default Financial Year",type: "select", options: ["2024-25","2025-26","2026-27"] },
    ]
  },
  {
    title: "Preferences",
    desc: "Almost done — customise your experience",
    fields: [
      { id: "investmentExp",  label: "Investment Experience",  type: "select", options: ["Beginner","Intermediate","Advanced"] },
      { id: "riskAppetite",   label: "Risk Appetite",          type: "select", options: ["Conservative","Moderate","Aggressive"] },
      { id: "theme",          label: "Theme Preference",       type: "select", options: ["Light","Dark","System"] },
      { id: "notifications",  label: "Enable Notifications",   type: "select", options: ["Yes","No"] },
    ]
  }
];

let currentStep = 0;
const formData = {};

export const initSetup = () => {
  renderStep(0);

  document.getElementById("setup-next").addEventListener("click", handleNext);
  document.getElementById("setup-back").addEventListener("click", handleBack);
};

const renderStep = (idx) => {
  const step = STEPS[idx];
  document.getElementById("setup-title").textContent = step.title;
  document.getElementById("setup-desc").textContent = step.desc;

  const dots = document.querySelectorAll(".setup-step-indicator .step");
  dots.forEach((d, i) => d.classList.toggle("active", i <= idx));

  const form = document.getElementById("setup-form");
  form.innerHTML = step.fields.map(f => `
    <div class="form-row">
      <label for="setup-${f.id}">${f.label}</label>
      ${f.type === "select"
        ? `<select id="setup-${f.id}" class="input">
             ${f.options.map(o => `<option value="${o}">${o}</option>`).join("")}
           </select>`
        : `<input id="setup-${f.id}" type="${f.type}" class="input" placeholder="${f.placeholder || ""}"
              value="${formData[f.id] || ""}" />`
      }
    </div>
  `).join("");

  // Restore saved values for selects
  step.fields.forEach(f => {
    if (f.type === "select" && formData[f.id]) {
      const el = document.getElementById(`setup-${f.id}`);
      if (el) el.value = formData[f.id];
    }
  });

  document.getElementById("setup-back").classList.toggle("hidden", idx === 0);
  document.getElementById("setup-next").textContent = idx === STEPS.length - 1 ? "Finish ✓" : "Next →";
};

const collectStep = () => {
  const step = STEPS[currentStep];
  step.fields.forEach(f => {
    const el = document.getElementById(`setup-${f.id}`);
    if (el) formData[f.id] = el.value.trim();
  });
};

const handleNext = async () => {
  collectStep();

  if (currentStep < STEPS.length - 1) {
    currentStep++;
    renderStep(currentStep);
  } else {
    // Save profile
    try {
      await saveProfile({ ...formData, setupDone: true });

      // Apply theme
      if (formData.theme === "Dark") document.documentElement.setAttribute("data-theme", "dark");

      document.getElementById("setup-screen").classList.add("hidden");
      document.getElementById("app").classList.remove("hidden");
      toast("Welcome to CapitalOne! 🌿", "success");

      window.dispatchEvent(new Event("app:ready"));
    } catch (err) {
      toast("Failed to save profile. Check your Firebase config.", "error");
      console.error(err);
    }
  }
};

const handleBack = () => {
  if (currentStep > 0) {
    collectStep();
    currentStep--;
    renderStep(currentStep);
  }
};
