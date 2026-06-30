// ============================================================
// js/import.js – Excel/CSV Import (Zerodha, Cashew)
// ============================================================
import { saveInvestment, getInvestments, saveAccount, getAccounts, saveCategory, getCategories, addTransaction } from "./database.js";
import { toast, openModal, closeModal, todayISO, genId } from "./utils.js";

const IMPORT_LIMIT = 5000; // hard safety cap; preview shows a sample, full set is imported

// ─── DATE NORMALIZATION ────────────────────────────────────────
// Handles: Excel serial numbers, JS Date objects, "DD-MM-YYYY", "DD/MM/YYYY",
// "MM/DD/YYYY", "YYYY-MM-DD", and empty/invalid values (falls back to today).
const parseImportDate = (value) => {
  if (value === null || value === undefined || value === "") return todayISO();

  // Excel serial date number (e.g. 45000)
  if (typeof value === "number") {
    if (value > 20000 && value < 80000) {
      const parsed = XLSX.SSF.parse_date_code(value);
      if (parsed) {
        const mm = String(parsed.m).padStart(2, "0");
        const dd = String(parsed.d).padStart(2, "0");
        return `${parsed.y}-${mm}-${dd}`;
      }
    }
    return todayISO();
  }

  // Already a JS Date object (SheetJS can return these with cellDates:true)
  if (value instanceof Date && !isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }

  const str = String(value).trim();
  if (!str) return todayISO();

  // ISO format YYYY-MM-DD already
  if (/^\d{4}-\d{2}-\d{2}/.test(str)) return str.slice(0, 10);

  // DD-MM-YYYY or DD/MM/YYYY
  let m = str.match(/^(\d{1,2})[-\/](\d{1,2})[-\/](\d{4})$/);
  if (m) {
    const [, d, mo, y] = m;
    return `${y}-${String(mo).padStart(2,"0")}-${String(d).padStart(2,"0")}`;
  }

  // DD-MM-YY or DD/MM/YY (2-digit year)
  m = str.match(/^(\d{1,2})[-\/](\d{1,2})[-\/](\d{2})$/);
  if (m) {
    const [, d, mo, y] = m;
    const fullYear = parseInt(y) > 50 ? `19${y}` : `20${y}`;
    return `${fullYear}-${String(mo).padStart(2,"0")}-${String(d).padStart(2,"0")}`;
  }

  // Fallback: let JS try to parse it (handles "Jan 5, 2025" etc.)
  const fallback = new Date(str);
  if (!isNaN(fallback.getTime()) && fallback.getFullYear() > 1980) {
    return fallback.toISOString().slice(0, 10);
  }

  return todayISO();
};

// ─── ZERODHA HOLDINGS IMPORT ──────────────────────────────────
export const importZerodhaFile = (file) => {
  const reader = new FileReader();
  reader.onload = async (e) => {
    try {
      const data = new Uint8Array(e.target.result);
      const wb = XLSX.read(data, { type: "array", cellDates: true });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(sheet, { defval: "" });

      if (rows.length === 0) { toast("No data found in file", "error"); return; }
      if (rows.length > IMPORT_LIMIT) {
        toast(`File has ${rows.length} rows — importing first ${IMPORT_LIMIT}`, "warning");
      }

      const existing = await getInvestments();
      const existingByISIN = {};
      existing.forEach(i => { if (i.isin) existingByISIN[i.isin] = i; });

      const allRows = rows.slice(0, IMPORT_LIMIT).map(row => {
        const isin = row["ISIN"] || row["isin"] || "";
        const symbol = row["Symbol"] || row["Instrument"] || row["Tradingsymbol"] || "";
        const qty = parseFloat(row["Quantity Available"] || row["Qty"] || row["Quantity"] || 0);
        const avgPrice = parseFloat(row["Average Price"] || row["Avg.cost"] || 0);
        const ltp = parseFloat(row["Previous Closing Price"] || row["LTP"] || avgPrice);
        const sector = row["Sector"] || "";

        return {
          assetType: "Equity",
          name: symbol,
          isin,
          quantity: qty,
          avgPrice,
          currentPrice: ltp,
          sector,
          broker: "Zerodha",
          currency: "INR",
          purchaseDate: todayISO(),
          isExisting: !!existingByISIN[isin],
        };
      });

      let added = 0, updated = 0;
      showImportPreview("Zerodha Holdings", allRows, async (rowsToImport) => {
        for (const row of rowsToImport) {
          const existingInv = existingByISIN[row.isin];
          await saveInvestment(existingInv?.id || null, row);
          existingInv ? updated++ : added++;
        }
        toast(`Imported: ${added} new, ${updated} updated`, "success");
        window.dispatchEvent(new Event("data:changed"));
      });

    } catch (err) {
      console.error(err);
      toast("Failed to parse Zerodha file. Check format.", "error");
    }
  };
  reader.readAsArrayBuffer(file);
};

// ─── CASHEW IMPORT ─────────────────────────────────────────────
export const importCashewFile = (file) => {
  const reader = new FileReader();
  reader.onload = async (e) => {
    try {
      const text = e.target.result;
      const wb = XLSX.read(text, { type: "string", cellDates: true });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(sheet, { defval: "", raw: true });

      if (rows.length === 0) { toast("No data found in file", "error"); return; }
      if (rows.length > IMPORT_LIMIT) {
        toast(`File has ${rows.length} rows — importing first ${IMPORT_LIMIT}`, "warning");
      }

      const existingAccounts = await getAccounts();
      const existingCategories = await getCategories();
      const accountMap = {};
      const categoryMap = {};
      existingAccounts.forEach(a => accountMap[a.name] = a.id);
      existingCategories.forEach(c => categoryMap[c.name] = c.id);

      const allRows = rows.slice(0, IMPORT_LIMIT).map(row => {
        const rawAmount = row["amount"];
        const amountNum = typeof rawAmount === "number" ? rawAmount : parseFloat(String(rawAmount).replace(/[^0-9.\-]/g, "")) || 0;
        const incomeFlag = row["income"];
        const isIncome = incomeFlag === true || incomeFlag === "true" || incomeFlag === "TRUE" ||
                          incomeFlag === 1 || incomeFlag === "1" || row["type"] === "income";

        return {
          account:     String(row["account"] || "Cash").trim(),
          amount:      amountNum,
          currency:    String(row["currency"] || "INR").trim() || "INR",
          title:       String(row["title"] || "").trim(),
          notes:       String(row["note"] || "").trim(),
          date:        parseImportDate(row["date"]),
          type:        isIncome ? "income" : "expense",
          category:    String(row["category name"] || "Other").trim() || "Other",
          subcategory: String(row["subcategory name"] || "").trim(),
          emoji:       String(row["emoji"] || row["icon"] || "📌").trim() || "📌",
          color:       String(row["color"] || "#5a6e3a").trim() || "#5a6e3a",
        };
      });

      showImportPreview("Cashew Transactions", allRows, async (rowsToImport) => {
        let txnCount = 0;
        for (const row of rowsToImport) {
          // Create account if missing
          if (!accountMap[row.account]) {
            const id = await saveAccount(null, { name: row.account, type: "Cash", currency: row.currency, balance: 0 });
            accountMap[row.account] = id;
          }
          // Create category if missing, or merge subcategory into existing category
          if (!categoryMap[row.category]) {
            const id = await saveCategory(null, {
              name: row.category, emoji: row.emoji, color: row.color,
              subcategories: row.subcategory ? [row.subcategory] : []
            });
            categoryMap[row.category] = id;
          } else if (row.subcategory) {
            const existingCat = existingCategories.find(c => c.id === categoryMap[row.category]);
            const subs = new Set(existingCat?.subcategories || []);
            if (!subs.has(row.subcategory)) {
              subs.add(row.subcategory);
              await saveCategory(categoryMap[row.category], { subcategories: [...subs] });
              if (existingCat) existingCat.subcategories = [...subs];
            }
          }
          await addTransaction({
            date: row.date,
            amount: Math.abs(row.amount),
            currency: row.currency,
            type: row.type,
            accountId: accountMap[row.account],
            categoryId: categoryMap[row.category],
            subcategory: row.subcategory,
            title: row.title,
            notes: row.notes,
            tags: [],
            amountINR: Math.abs(row.amount),
          });
          txnCount++;
        }
        toast(`Imported ${txnCount} transactions`, "success");
        window.dispatchEvent(new Event("data:changed"));
      });

    } catch (err) {
      console.error(err);
      toast("Failed to parse Cashew file. Check format.", "error");
    }
  };
  reader.readAsText(file);
};

// ─── PREVIEW MODAL ─────────────────────────────────────────────
const showImportPreview = (title, rows, onConfirm) => {
  const cols = Object.keys(rows[0] || {}).filter(k => k !== "isExisting");
  const previewCount = Math.min(rows.length, 10);
  const body = `
    <p class="muted" style="margin-bottom:var(--sp-md)">Found ${rows.length} record(s). Preview below (showing first ${previewCount}):</p>
    <div class="inv-table-wrap" style="max-height:320px;overflow-y:auto">
      <table class="inv-table">
        <thead><tr>${cols.map(c=>`<th>${c}</th>`).join("")}</tr></thead>
        <tbody>
          ${rows.slice(0,previewCount).map(r => `<tr>${cols.map(c=>`<td>${r[c]}</td>`).join("")}</tr>`).join("")}
        </tbody>
      </table>
    </div>`;
  const footer = `
    <button class="btn btn-ghost" id="imp-cancel">Cancel</button>
    <button class="btn btn-primary" id="imp-confirm">Import All ${rows.length}</button>`;
  openModal(`Import Preview: ${title}`, body, footer);

  document.getElementById("imp-cancel").onclick = closeModal;
  document.getElementById("imp-confirm").onclick = async () => {
    document.getElementById("imp-confirm").textContent = `Importing ${rows.length}…`;
    document.getElementById("imp-confirm").disabled = true;
    await onConfirm(rows);
    closeModal();
  };
};
