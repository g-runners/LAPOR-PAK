import { fetchReports } from "./storage.js";
import { initializeNavigation } from "./ui.js";

initializeNavigation();

const stats = document.getElementById("home-stats");
const message = document.getElementById("home-message");
const setupStatus = document.getElementById("setup-status");

try {
  const reports = await fetchReports();
  const counts = {
    total: reports.length,
    Verifikasi: 0,
    "Belum Ditangani": 0,
    "Dalam Proses Perbaikan": 0,
    Selesai: 0
  };

  for (const report of reports) {
    if (Object.hasOwn(counts, report.status)) counts[report.status] += 1;
  }

  for (const [status, count] of Object.entries(counts)) {
    const target = stats.querySelector(`[data-stat="${CSS.escape(status)}"]`);
    if (target) target.textContent = String(count);
  }
  message.textContent = reports.length ? "" : "Data laporan belum tersedia.";
} catch (error) {
  setupStatus.hidden = false;
  setupStatus.textContent = error.message;
  message.dataset.type = "error";
  message.textContent = "Statistik belum dapat dimuat. Periksa konfigurasi Supabase dan policy SELECT (RLS).";
}
