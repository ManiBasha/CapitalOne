// ============================================================
// js/import.js – Excel/CSV Import (Zerodha, Cashew)
// ============================================================
import { saveInvestment, getInvestments, saveAccount, getAccounts, saveCategory, getCategories, addTransaction } from "./database.js";
import { toast, openModal, closeModal, todayISO, genId } from "./utils.js";

// ─── ZERODHA HOLDINGS IMPORT ──────────────────────────────────
export const importZerodhaFile = (file) => {
  const reader = new FileReader();
  reader.onload = async (e) => {
    try {
      const data = new Uint8Array(e.target.result);
      const wb = XLSX.read(data, { type: "array" });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(sheet, { defval: "" });

      if (rows.length === 0) { toast("No data found in file", "error"); return; }

      const existing = await getInvestments();
      const existingByISIN = {};
      existing.forEach(i => { if (i.isin) existingByISIN[i.isin] = i; });

      let added = 0, updated = 0;
      const preview = rows.slice(0, 50).map(row => {
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

      showImportPreview("Zerodha Holdings", preview, async (rowsToImport) => {
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
      const wb = XLSX.read(text, { type: "string" });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(sheet, { defval: "" });

      if (rows.length === 0) { toast("No data found in file", "error"); return; }

      const existingAccounts = await getAccounts();
      const existingCategories = await getCategories();
      const accountMap = {};
      const categoryMap = {};
      existingAccounts.forEach(a => accountMap[a.name] = a.id);
      existingCategories.forEach(c => categoryMap[c.name] = c.id);

      const preview = rows.slice(0, 50).map(row => ({
        account:  row["account"] || "Cash",
        amount:   parseFloat(row["amount"]) || 0,
        currency: row["currency"] || "INR",
        title:    row["title"] || "",
        notes:    row["note"] || "",
        date:     row["date"] || todayISO(),
        type:     (row["income"] === true || row["income"] === "true" || row["type"]==="income") ? "income" : "expense",
        category: row["category name"] || "Other",
        subcategory: row["subcategory name"] || "",
        emoji:    row["emoji"] || "📌",
        color:    row["color"] || "#5a6e3a",
      }));

      showImportPreview("Cashew Transactions", preview, async (rowsToImport) => {
        let txnCount = 0;
        for (const row of rowsToImport) {
          // Create account if missing
          if (!accountMap[row.account]) {
            const id = await saveAccount(null, { name: row.account, type: "Cash", currency: row.currency, balance: 0 });
            accountMap[row.account] = id;
          }
          // Create category if missing
          if (!categoryMap[row.category]) {
            const id = await saveCategory(null, { name: row.category, emoji: row.emoji, color: row.color });
            categoryMap[row.category] = id;
          }
          await addTransaction({
            date: row.date,
            amount: Math.abs(row.amount),
            currency: row.currency,
            type: row.type,
            accountId: accountMap[row.account],
            categoryId: categoryMap[row.category],
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
  const body = `
    <p class="muted" style="margin-bottom:var(--sp-md)">Found ${rows.length} record(s). Preview below (showing first ${Math.min(rows.length,10)}):</p>
    <div class="inv-table-wrap" style="max-height:320px;overflow-y:auto">
      <table class="inv-table">
        <thead><tr>${cols.map(c=>`<th>${c}</th>`).join("")}</tr></thead>
        <tbody>
          ${rows.slice(0,10).map(r => `<tr>${cols.map(c=>`<td>${r[c]}</td>`).join("")}</tr>`).join("")}
        </tbody>
      </table>
    </div>`;
  const footer = `
    <button class="btn btn-ghost" id="imp-cancel">Cancel</button>
    <button class="btn btn-primary" id="imp-confirm">Import All ${rows.length}</button>`;
  openModal(`Import Preview: ${title}`, body, footer);

  document.getElementById("imp-cancel").onclick = closeModal;
  document.getElementById("imp-confirm").onclick = async () => {
    document.getElementById("imp-confirm").textContent = "Importing…";
    document.getElementById("imp-confirm").disabled = true;
    await onConfirm(rows);
    closeModal();
  };
};
