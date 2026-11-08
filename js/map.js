import { getCurrentProfile, ensureAnonymousSession } from "./auth.js";
import { NEARBY_RADIUS_METERS } from "./supabase-config.js";
import { fetchReports, submitRating } from "./storage.js";
import { initializeNavigation } from "./ui.js";
import { exportReportsAndStats } from "./export.js";
import { mountTurnstile } from "./turnstile.js";

initializeNavigation();

const mapMessage = document.getElementById("map-message");
const loadingMessage = document.getElementById("map-loading");
const detail = document.getElementById("report-detail");
const ratingForm = document.getElementById("rating-form");
const ratingMessage = document.getElementById("rating-message");
const priorityList = document.getElementById("priority-list");
const statusFilter = document.getElementById("status-filter");
const map = window.L?.map ? L.map("report-map").setView([-6.2383, 106.9933], 12) : null;
if (map) {
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: "&copy; OpenStreetMap contributors"
  }).addTo(map);
} else {
  document.getElementById("report-map").textContent = "Leaflet tidak termuat. Peta tidak tersedia.";
}

let allReports = [];
let displayedReports = [];
let activeReport = null;
let ratingCaptchaToken = "";
let ratingCaptchaWidget = null;

function setMessage(element, text, type = "") {
  element.textContent = text;
  element.dataset.type = type;
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[character]);
}

function hasCoordinates(report) {
  if (report.latitude === null || report.latitude === undefined || report.latitude === "" ||
      report.longitude === null || report.longitude === undefined || report.longitude === "") {
    return false;
  }
  const latitude = Number(report.latitude);
  const longitude = Number(report.longitude);
  return Number.isFinite(latitude) && Number.isFinite(longitude) &&
    latitude >= -90 && latitude <= 90 && longitude >= -180 && longitude <= 180;
}

function distanceMeters(first, second) {
  const radians = (degrees) => degrees * Math.PI / 180;
  const earthRadius = 6371000;
  const deltaLatitude = radians(Number(second.latitude) - Number(first.latitude));
  const deltaLongitude = radians(Number(second.longitude) - Number(first.longitude));
  const latitude1 = radians(Number(first.latitude));
  const latitude2 = radians(Number(second.latitude));
  const a = Math.sin(deltaLatitude / 2) ** 2 +
    Math.cos(latitude1) * Math.cos(latitude2) * Math.sin(deltaLongitude / 2) ** 2;
  return earthRadius * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function nearbyCount(report, reports = allReports) {
  if (!hasCoordinates(report)) return 0;
  return reports.filter((other) =>
    other.id !== report.id && hasCoordinates(other) &&
    distanceMeters(report, other) <= NEARBY_RADIUS_METERS
  ).length;
}

function levelRank(level) {
  return ({ Parah: 3, Sedang: 2, Ringan: 1 })[level] || 0;
}

function severityColor(level) {
  return ({ Parah: "#b94b3a", Sedang: "#e3a34b", Ringan: "#43815c" })[level] || "#587066";
}

function selectedReports() {
  const status = statusFilter.value;
  return status ? allReports.filter((report) => report.status === status) : allReports;
}

function reportTitle(report) {
  return report.address || report.description || `Laporan ${report.id}`;
}

function safePhoto(url, alt) {
  if (!url) return "";
  return `<img class="detail-photo" src="${escapeHtml(url)}" alt="${escapeHtml(alt)}" loading="lazy">`;
}

function renderStats(reports) {
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
    const target = document.querySelector(`[data-stat="${CSS.escape(status)}"]`);
    if (target) target.textContent = String(count);
  }
}

function renderPriority(reports) {
  const sorted = [...reports].sort((a, b) =>
    levelRank(b.damage_level) - levelRank(a.damage_level) ||
    nearbyCount(b) - nearbyCount(a) ||
    new Date(b.created_at || 0) - new Date(a.created_at || 0)
  );
  if (!sorted.length) {
    priorityList.innerHTML = '<div class="empty-state">Data laporan belum tersedia.</div>';
    return;
  }

  priorityList.innerHTML = sorted.slice(0, 25).map((report) => `
    <button type="button" class="report-item" data-report-id="${escapeHtml(report.id)}">
      <strong>${escapeHtml(reportTitle(report))}</strong>
      <p><span class="status-pill" data-status="${escapeHtml(report.status)}">${escapeHtml(report.status || "Status tidak tersedia")}</span></p>
      <p>Level ${escapeHtml(report.damage_level || "belum terukur")} · ${nearbyCount(report)} laporan lain dalam ${NEARBY_RADIUS_METERS} m</p>
    </button>
  `).join("");

  priorityList.querySelectorAll("[data-report-id]").forEach((button) => {
    button.addEventListener("click", () => selectReport(button.dataset.reportId));
  });
}

function renderMarkers(reports) {
  if (!map) return;
  map.eachLayer((layer) => {
    if (layer instanceof L.Marker || layer instanceof L.CircleMarker) map.removeLayer(layer);
  });

  const located = reports.filter(hasCoordinates);
  displayedReports = reports;
  for (const report of located) {
    const point = [Number(report.latitude), Number(report.longitude)];
    const circle = L.circleMarker(point, {
      radius: 8,
      color: severityColor(report.damage_level),
      fillColor: severityColor(report.damage_level),
      fillOpacity: .8,
      weight: 2
    }).addTo(map);
    circle.bindTooltip(escapeHtml(reportTitle(report)), { direction: "top" });
    circle.on("click", () => selectReport(report.id));
  }

  if (located.length === 1) map.setView([Number(located[0].latitude), Number(located[0].longitude)], 15);
  else if (located.length > 1) {
    map.fitBounds(located.map((report) => [Number(report.latitude), Number(report.longitude)]), { padding: [24, 24], maxZoom: 16 });
  }
}

function renderDetail(report) {
  activeReport = report;
  if (!report) {
    detail.className = "empty-state";
    detail.textContent = "Pilih titik atau laporan untuk melihat detail.";
    ratingForm.classList.add("hidden");
    return;
  }

  const linkedText = report.merged_into
    ? `<p class="inline-note">Laporan ini digabungkan ke ID ${escapeHtml(report.merged_into)}.</p>`
    : "";
  detail.className = "";
  detail.innerHTML = `
    ${safePhoto(report.photo_url, "Foto kerusakan")}
    <h3>${escapeHtml(reportTitle(report))}</h3>
    <dl class="detail-list">
      <div><dt>ID</dt><dd>${escapeHtml(report.id)}</dd></div>
      <div><dt>Status</dt><dd><span class="status-pill" data-status="${escapeHtml(report.status)}">${escapeHtml(report.status || "Status tidak tersedia")}</span></dd></div>
      <div><dt>Level</dt><dd>${escapeHtml(report.damage_level || "Belum terukur")}</dd></div>
      <div><dt>Lokasi</dt><dd>${escapeHtml(report.address || "Alamat tidak diisi")}</dd></div>
      <div><dt>Koordinat</dt><dd>${hasCoordinates(report) ? `${escapeHtml(report.latitude)}, ${escapeHtml(report.longitude)}` : "Tidak tersedia"}</dd></div>
      <div><dt>Dibuat</dt><dd>${escapeHtml(report.created_at ? new Date(report.created_at).toLocaleString("id-ID") : "Tidak tersedia")}</dd></div>
      <div><dt>Deskripsi</dt><dd>${escapeHtml(report.description || "Tidak ada deskripsi")}</dd></div>
      ${report.status_reason ? `<div><dt>Catatan</dt><dd>${escapeHtml(report.status_reason)}</dd></div>` : ""}
    </dl>
    ${report.after_photo_url ? safePhoto(report.after_photo_url, "Foto setelah perbaikan") : ""}
    ${linkedText}
    <p class="field-hint">${nearbyCount(report)} laporan lain berjarak maksimal ${NEARBY_RADIUS_METERS} meter.</p>
  `;
  ratingForm.classList.toggle("hidden", report.status !== "Selesai");
  setMessage(ratingMessage, "");
}

function selectReport(reportId) {
  const report = allReports.find((item) => String(item.id) === String(reportId));
  if (!report) return;
  renderDetail(report);
  if (map && hasCoordinates(report)) {
    map.setView([Number(report.latitude), Number(report.longitude)], Math.max(map.getZoom(), 16));
  }
}

statusFilter.addEventListener("change", () => {
  const reports = selectedReports();
  renderStats(reports);
  renderMarkers(reports);
  renderPriority(reports);
  if (!reports.length) setMessage(mapMessage, "Data laporan belum tersedia untuk filter ini.");
  else setMessage(mapMessage, `${reports.length} laporan ditampilkan.`);
});

document.getElementById("export-csv").addEventListener("click", () => {
  try {
    exportReportsAndStats(selectedReports());
    setMessage(mapMessage, "CSV laporan dan statistik berhasil diunduh.", "success");
  } catch (error) {
    setMessage(mapMessage, error.message, "error");
  }
});

async function initializeRatingCaptcha() {
  if (ratingCaptchaWidget) return;
  try {
    const { user } = await getCurrentProfile();
    if (user && !user.is_anonymous) return;
    ratingCaptchaWidget = await mountTurnstile(
      document.getElementById("rating-turnstile"),
      (token) => { ratingCaptchaToken = token; }
    );
  } catch (error) {
    setMessage(ratingMessage, `Verifikasi penilaian belum siap: ${error.message}`, "error");
    console.error("Inisialisasi CAPTCHA penilaian gagal:", error);
  }
}

ratingForm.addEventListener("focusin", initializeRatingCaptcha, { once: true });
ratingForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!activeReport || activeReport.status !== "Selesai") return;
  const score = Number(document.getElementById("rating-score").value);
  if (!Number.isInteger(score) || score < 1 || score > 5) {
    setMessage(ratingMessage, "Pilih nilai antara 1 dan 5.", "error");
    return;
  }
  try {
    const { user } = await getCurrentProfile();
    const ratingUser = user && !user.is_anonymous
      ? user
      : await ensureAnonymousSession(ratingCaptchaToken);
    await submitRating(activeReport.id, ratingUser.id, score);
    setMessage(ratingMessage, "Terima kasih, penilaian berhasil dikirim.", "success");
    ratingForm.reset();
    if (ratingCaptchaWidget) ratingCaptchaWidget.reset();
  } catch (error) {
    setMessage(ratingMessage, `Penilaian gagal: ${error.message}`, "error");
    console.error("Pengiriman rating gagal:", error);
  }
});

async function loadMapData() {
  loadingMessage.hidden = false;
  setMessage(mapMessage, "Memuat laporan…");
  if (!map) {
    loadingMessage.hidden = true;
    setMessage(mapMessage, "Peta tidak dapat dimuat karena Leaflet CDN tidak tersedia.", "error");
    return;
  }
  try {
    allReports = await fetchReports();
    const filtered = selectedReports();
    renderStats(filtered);
    renderMarkers(filtered);
    renderPriority(filtered);
    loadingMessage.hidden = true;
    if (!allReports.length) setMessage(mapMessage, "Data laporan belum tersedia.");
    else setMessage(mapMessage, `${filtered.length} laporan ditampilkan.`, "success");
  } catch (error) {
    loadingMessage.hidden = true;
    priorityList.innerHTML = "";
    setMessage(mapMessage, `Laporan gagal dimuat: ${error.message}. Periksa policy SELECT/RLS.`, "error");
    console.error("Pemuatan peta gagal:", error);
  }
}

loadMapData();
