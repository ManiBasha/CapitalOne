// ============================================================
// js/export.js – Excel / JSON Export & Backup
// ============================================================
import { exportAllData, importAllData, getInvestments, getBuyLots, getSellTrades } from "./database.js?v=20260707a";
import { toast } from "./utils.js?v=20260707a";

// ─── EXPORT TO EXCEL (transaction-level: one row per Buy or Sell) ──
export const exportToExcel = async () => {
  try {
    const invs = await getInvestments();
    const rows = [];

    for (const inv of invs) {
      const [buys, sells] = await Promise.all([getBuyLots(inv.id), getSellTrades(inv.id)]);

      buys.forEach(b => rows.push({
        "Asset Name": inv.name,
        "Asset Type": inv.assetType,
        "Buy/Sell": "Buy",
        "Qty": b.quantity,
        "Buy Price": b.price,
        "Current Price": inv.currentPrice,
        "Sell Price": "",
        "Buy Date": b.date,
        "Sell Date": "",
        "Broker": inv.broker,
        "Sector": inv.sector,
        "Exit Load (MF Sell)": "",
        "Total Charges": b.charges?.total || 0,
      }));

      sells.forEach(s => rows.push({
        "Asset Name": inv.name,
        "Asset Type": inv.assetType,
        "Buy/Sell": "Sell",
        "Qty": s.quantity,
        "Buy Price": inv.avgPrice,
        "Current Price": inv.currentPrice,
        "Sell Price": s.sellPrice,
        "Buy Date": "",
        "Sell Date": s.sellDate,
        "Broker": inv.broker,
        "Sector": inv.sector,
        "Exit Load (MF Sell)": s.charges?.exitLoad || "",
        "Total Charges": s.charges?.total || 0,
      }));
    }

    if (rows.length === 0) { toast("No buy/sell transactions to export yet", "warning"); return; }

    const wb = XLSX.utils.book_new();
    const sheet = XLSX.utils.json_to_sheet(rows);
    XLSX.utils.book_append_sheet(wb, sheet, "Transactions");

    XLSX.writeFile(wb, `CapitalOne_Transactions_${new Date().toISOString().slice(0,10)}.xlsx`);
    toast(`Exported ${rows.length} transactions`, "success");
  } catch (err) {
    console.error(err);
    toast("Export failed", "error");
  }
};

// ─── EXPORT TO JSON BACKUP ─────────────────────────────────────
export const exportToJSON = async () => {
  try {
    const data = await exportAllData();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `CapitalOne_Backup_${new Date().toISOString().slice(0,10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast("Backup downloaded", "success");
  } catch (err) {
    console.error(err);
    toast("Backup failed", "error");
  }
};

// ─── RESTORE FROM JSON ──────────────────────────────────────────
export const restoreFromJSON = (file) => {
  const reader = new FileReader();
  reader.onload = async (e) => {
    try {
      const data = JSON.parse(e.target.result);
      if (!confirm("This will merge backup data into your account. Continue?")) return;
      await importAllData(data);
      toast("Backup restored successfully", "success");
      window.dispatchEvent(new Event("data:changed"));
      setTimeout(() => location.reload(), 1200);
    } catch (err) {
      console.error(err);
      toast("Invalid backup file", "error");
    }
  };
  reader.readAsText(file);
};
