// ============================================================
// js/theme.js – Color-wheel theme engine (Light + Dark from one hue)
// ============================================================
import { ls } from "./utils.js?v=20260705b";

const DEFAULT_HEX = "#5a6e3a"; // original olive

// ─── COLOR MATH ────────────────────────────────────────────────
const hexToHSL = (hex) => {
  let r = parseInt(hex.slice(1, 3), 16) / 255;
  let g = parseInt(hex.slice(3, 5), 16) / 255;
  let b = parseInt(hex.slice(5, 7), 16) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h, s, l = (max + min) / 2;
  if (max === min) { h = s = 0; }
  else {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = (g - b) / d + (g < b ? 6 : 0); break;
      case g: h = (b - r) / d + 2; break;
      case b: h = (r - g) / d + 4; break;
    }
    h *= 60;
  }
  return { h, s: s * 100, l: l * 100 };
};

const hsl = (h, s, l) => `hsl(${h.toFixed(1)} ${clampPct(s)}% ${clampPct(l)}%)`;
const clampPct = (n) => Math.min(100, Math.max(0, n));

// ─── PALETTE GENERATION ────────────────────────────────────────
// Builds a full set of CSS custom properties for both Light and Dark
// modes from a single base hue, keeping the same visual structure
// (sidebar dark-on-dark, cards, borders, muted text, etc.) as the
// original hand-picked olive theme.
export const generatePalettes = (hex) => {
  const { h, s } = hexToHSL(hex);
  const S = Math.max(20, Math.min(s, 55)); // keep saturation in a tasteful range

  const light = {
    "--c-primary":       hsl(h, S, 32),
    "--c-primary-hover": hsl(h, S, 26),
    "--c-primary-light": hsl(h, S * 0.6, 92),
    "--c-accent":        hsl((h + 35) % 360, S + 10, 45),
    "--c-sage":          hsl(h, S * 0.5, 68),
    "--bg-page":         hsl(h, Math.min(S, 18), 96.5),
    "--bg-card":         "#ffffff",
    "--bg-card-hover":   hsl(h, Math.min(S, 15), 98),
    "--bg-sidebar":      hsl(h, Math.min(S + 10, 45), 15),
    "--bg-sidebar-hover":hsl(h, Math.min(S + 10, 45), 20),
    "--bg-input":        hsl(h, Math.min(S, 15), 94),
    "--t-primary":       hsl(h, Math.min(S, 25), 13),
    "--t-secondary":     hsl(h, Math.min(S, 20), 30),
    "--t-muted":         hsl(h, Math.min(S, 12), 48),
    "--t-on-dark":       "#ffffff",
    "--border":          hsl(h, Math.min(S, 15), 88),
    "--border-focus":    hsl(h, S, 45),
  };

  const dark = {
    "--c-primary":       hsl(h, Math.max(S - 5, 20), 58),
    "--c-primary-hover": hsl(h, Math.max(S - 5, 20), 66),
    "--c-primary-light": hsl(h, Math.max(S - 10, 15), 20),
    "--c-accent":        hsl((h + 35) % 360, S + 10, 60),
    "--c-sage":          hsl(h, S * 0.4, 55),
    "--bg-page":         hsl(h, Math.min(S, 20), 8),
    "--bg-card":         hsl(h, Math.min(S, 18), 12),
    "--bg-card-hover":   hsl(h, Math.min(S, 18), 15),
    "--bg-sidebar":      hsl(h, Math.min(S + 8, 30), 6),
    "--bg-sidebar-hover":hsl(h, Math.min(S + 8, 30), 10),
    "--bg-input":        hsl(h, Math.min(S, 18), 15),
    "--t-primary":       hsl(h, Math.min(S, 15), 92),
    "--t-secondary":     hsl(h, Math.min(S, 15), 75),
    "--t-muted":         hsl(h, Math.min(S, 10), 55),
    "--t-on-dark":       "#ffffff",
    "--border":          hsl(h, Math.min(S, 18), 20),
    "--border-focus":    hsl(h, Math.max(S - 5, 20), 55),
  };

  return { light, dark };
};

// ─── APPLY ──────────────────────────────────────────────────────
const applyVars = (vars) => {
  const root = document.documentElement;
  Object.entries(vars).forEach(([k, v]) => root.style.setProperty(k, v));
};

// Applies whichever palette (light/dark) matches the current data-theme,
// so switching Light<->Dark always uses the color-wheel-derived palette.
export const applyThemeVars = () => {
  const hex = ls.get("theme_hex", DEFAULT_HEX);
  const palettes = generatePalettes(hex);
  const mode = document.documentElement.getAttribute("data-theme") === "dark" ? "dark" : "light";
  applyVars(palettes[mode]);
};

export const setThemeColor = (hex) => {
  ls.set("theme_hex", hex);
  applyThemeVars();
};

export const resetThemeColor = () => {
  ls.remove("theme_hex");
  // Clear inline overrides so the stylesheet defaults (olive) take over again
  const root = document.documentElement;
  [
    "--c-primary","--c-primary-hover","--c-primary-light","--c-accent","--c-sage",
    "--bg-page","--bg-card","--bg-card-hover","--bg-sidebar","--bg-sidebar-hover","--bg-input",
    "--t-primary","--t-secondary","--t-muted","--t-on-dark","--border","--border-focus"
  ].forEach(v => root.style.removeProperty(v));
};

export const getThemeColor = () => ls.get("theme_hex", DEFAULT_HEX);

export const initThemeEngine = () => {
  if (ls.get("theme_hex")) applyThemeVars();
};

// ─── CUSTOM APP ICON ────────────────────────────────────────────
export const applyStoredAppIcon = () => {
  const dataUrl = ls.get("app_icon_data");
  const link = document.getElementById("favicon-link");
  if (dataUrl && link) link.href = dataUrl;
};

export const setAppIcon = (dataUrl) => {
  ls.set("app_icon_data", dataUrl);
  const link = document.getElementById("favicon-link");
  if (link) link.href = dataUrl;
};

export const resetAppIcon = () => {
  ls.remove("app_icon_data");
  const link = document.getElementById("favicon-link");
  if (link) link.href = "data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><rect width=%22100%22 height=%22100%22 rx=%2220%22 fill=%22%235a6e3a%22/><text x=%2250%22 y=%2266%22 font-size=%2255%22 text-anchor=%22middle%22 fill=%22white%22 font-family=%22sans-serif%22>C</text></svg>";
};
