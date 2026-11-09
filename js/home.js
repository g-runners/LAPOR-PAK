import { fetchReports } from "./storage.js";
import { exportReportsAndStats } from "./export.js";
import { initializeNavigation } from "./ui.js";
import { NEARBY_RADIUS_METERS } from "./supabase-config.js";
import { sortReportsByPriority } from "./report-priority.js";

initializeNavigation();

const reportList = document.getElementById("report-list");
const storageError = document.getElementById("storage-error");
const statusFilter = document.getElementById("status-filter");
const searchInput = document.getElementById("report-search");
const reportCount = document.getElementById("nav-report-count");
const accessDenied = new URLSearchParams(window.location.search).get("access") === "denied";
let reports = [];

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[character]);
}

function setStat(id, value) {
  const element = document.getElementById(id);
  if (element) element.textContent = String(value);
}

function renderStats(items) {
  setStat("stat-total", items.length);
  setStat("stat-pending", items.filter((report) =>
    ["Verifikasi", "Belum Ditangani"].includes(report.status)
  ).length);
  setStat("stat-progress", items.filter((report) => report.status === "Dalam Proses Perbaikan").length);
  setStat("stat-complete", items.filter((report) => report.status === "Selesai").length);
}

function renderReports() {
  const status = statusFilter.value;
  const query = searchInput.value.trim().toLocaleLowerCase("id");
  const filtered = reports.filter((report) => {
    const matchesStatus = !status || report.status === status;
    const searchable = `${report.address || ""} ${report.description || ""} ${report.id}`.toLocaleLowerCase("id");
    return matchesStatus && searchable.includes(query);
  });

  if (!filtered.length) {
    reportList.innerHTML = '<div class="empty-state"><div class="empty-icon">⌕</div><h3>Belum ada laporan yang cocok</h3><p>Ubah filter atau kirim laporan jalan rusak.</p></div>';
    return;
  }

  reportList.innerHTML = sortReportsByPriority(filtered, NEARBY_RADIUS_METERS, reports).map((report) => `
    <article class="report-card">
      ${report.photo_url
        ? `<img class="report-photo" src="${escapeHtml(report.photo_url)}" alt="Foto laporan jalan" loading="lazy">`
        : '<div class="report-photo report-photo-placeholder" aria-hidden="true">⌖</div>'}
      <div class="report-main">
        <div class="report-topline"><span class="severity-pill">${escapeHtml(report.damage_level || "Belum terukur")}</span><span class="status-pill">${escapeHtml(report.status || "Status tidak tersedia")}</span></div>
        <h3>${escapeHtml(report.address || "Lokasi laporan")}</h3>
        <p class="report-location">${escapeHtml(report.address || "Lokasi tidak diisi")}</p>
        <div class="report-meta"><span>${escapeHtml(report.description || "Tidak ada deskripsi")}</span></div>
      </div>
    </article>
  `).join("");
}

statusFilter.addEventListener("change", renderReports);
searchInput.addEventListener("input", renderReports);
document.getElementById("export-csv").addEventListener("click", () => {
  try {
    exportReportsAndStats(reports);
    storageError.hidden = true;
  } catch (error) {
    storageError.hidden = false;
    storageError.textContent = error.message;
  }
});

try {
  reports = await fetchReports();
  reportCount.textContent = String(reports.length);
  renderStats(reports);
  renderReports();
  storageError.hidden = true;
} catch (error) {
  storageError.hidden = false;
  storageError.textContent = `Data laporan belum dapat dimuat: ${error.message}`;
  console.error("Beranda gagal memuat laporan:", error);
}

if (accessDenied) {
  storageError.hidden = false;
  storageError.textContent = "Akses ditolak. Akun Anda tidak memiliki izin untuk membuka halaman tersebut.";
}
