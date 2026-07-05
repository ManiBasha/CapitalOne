// ============================================================
// js/import.js – Excel Import (Zerodha holdings)
// ============================================================
import { saveInvestment, getInvestments } from "./database.js?v=20260705b";
import { toast, openModal, closeModal, todayISO } from "./utils.js?v=20260705b";

const IMPORT_LIMIT = 5000; // hard safety cap; preview shows a sample, full set is imported

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
