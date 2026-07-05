// ============================================================
// js/export.js – Excel / JSON Export & Backup
// ============================================================
import { exportAllData, importAllData, getInvestments } from "./database.js?v=20260705b";
import { toast } from "./utils.js?v=20260705b";

// ─── EXPORT TO EXCEL ──────────────────────────────────────────
export const exportToExcel = async () => {
  try {
    const invs = await getInvestments();

    const wb = XLSX.utils.book_new();

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
