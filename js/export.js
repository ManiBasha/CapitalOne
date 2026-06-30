// ============================================================
// js/export.js – Excel / CSV / JSON Export & Backup
// ============================================================
import { exportAllData, importAllData, getTransactions, getInvestments } from "./database.js";
import { toast } from "./utils.js";

// ─── EXPORT TO EXCEL ──────────────────────────────────────────
export const exportToExcel = async () => {
  try {
    const txns = await getTransactions();
    const invs = await getInvestments();

    const wb = XLSX.utils.book_new();

    const txnSheet = XLSX.utils.json_to_sheet(txns.map(t => ({
      Date: t.date, Title: t.title, Type: t.type, Amount: t.amount,
      Currency: t.currency, Category: t.categoryId, Account: t.accountId, Notes: t.notes
    })));
    XLSX.utils.book_append_sheet(wb, txnSheet, "Transactions");

    const invSheet = XLSX.utils.json_to_sheet(invs.map(i => ({
      Name: i.name, Type: i.assetType, Quantity: i.quantity,
      AvgPrice: i.avgPrice, CurrentPrice: i.currentPrice, Broker: i.broker, Sector: i.sector
    })));
    XLSX.utils.book_append_sheet(wb, invSheet, "Investments");

    XLSX.writeFile(wb, `CapitalOne_Export_${new Date().toISOString().slice(0,10)}.xlsx`);
    toast("Excel file downloaded", "success");
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
