import { escapeHtml, formatRoadDimensions, getRoadDamageScore } from "./priority.js";
import { hasCoordinates } from "../report-priority.js";

export function safePhoto(url, alt) {
  if (!url) return "";
  let parsed;
  try {
    parsed = new URL(url, window.location.href);
  } catch {
    return "";
  }
  if (!["http:", "https:"].includes(parsed.protocol)) return "";
  return `<img class="detail-photo" src="${escapeHtml(parsed.href)}" alt="${escapeHtml(alt)}" loading="lazy">`;
}

function formatDimension(value) {
  const dimension = Number(value);
  return Number.isFinite(dimension) && dimension > 0 ? `${dimension.toFixed(1)} cm` : "Belum diukur";
}

function formatTimestamp(value) {
  if (!value) return "Tidak tersedia";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString("id-ID");
}

export function renderReportDetails(container, report, road, duplicateCount, nearbyReports, nearbyRadius) {
  if (!report) {
    container.innerHTML = '<p class="map-eyebrow">DETAIL LAPORAN</p><p>Pilih pin atau laporan dalam daftar prioritas.</p>';
    return;
  }

  const score = getRoadDamageScore(road);
  const roadDimensions = formatRoadDimensions(road);
  const roadDimensionsStatus = roadDimensions
    ? road.dimensions_verified ? "Diverifikasi petugas" : "Nilai default; menunggu verifikasi petugas"
    : "Belum tersedia";
  const area = Number(report.pothole_area_cm2);
  const areaText = Number.isFinite(area) && area > 0 ? `${area.toFixed(1)} cm² (perkiraan)` : "Belum diukur";
  const statusClass = report.status === "Verifikasi" ? " is-verification" : "";
  const afterPhoto = report.status === "Selesai" && report.after_photo_url
    ? `<div class="detail-proof"><strong>Foto setelah perbaikan</strong>${safePhoto(report.after_photo_url, "Foto setelah perbaikan")}</div>`
    : "";
  const coordinatesAreValid = hasCoordinates(report);
  const coordinateText = coordinatesAreValid
    ? `${Number(report.latitude).toFixed(6)}, ${Number(report.longitude).toFixed(6)}`
    : "Koordinat tidak tersedia";

  container.innerHTML = `
    <p class="map-eyebrow">DETAIL LAPORAN</p>
    ${safePhoto(report.photo_url, "Foto laporan jalan rusak")}
    <h2>${escapeHtml(report.address || road?.name || "Lokasi laporan")}</h2>
    <span class="map-popup-status${statusClass}">${escapeHtml(report.status || "Status tidak tersedia")}</span>
    <dl class="detail-grid">
      <div><dt>Nama jalan</dt><dd>${escapeHtml(road?.name || report.road_name || "Belum dikelompokkan")}</dd></div>
      <div><dt>ID laporan</dt><dd>${escapeHtml(report.id)}</dd></div>
      <div><dt>Alamat</dt><dd>${escapeHtml(report.address || "Belum tersedia")}</dd></div>
      <div><dt>Dimensi jalan</dt><dd>${escapeHtml(roadDimensions || "Belum tersedia")} · ${roadDimensionsStatus}</dd></div>
      <div><dt>Prioritas jalan</dt><dd>${road?.damage_percentage === null || road?.damage_percentage === undefined
        ? "Menunggu ukuran jalan dan laporan"
        : `${Number(road.damage_percentage).toFixed(2)}% · skor ${score}/10`}</dd></div>
      <div><dt>Tingkat kerusakan</dt><dd>${escapeHtml(report.damage_level || "Belum terukur")}</dd></div>
      <div><dt>Ukuran lubang</dt><dd>${formatDimension(report.pothole_length_cm)} × ${formatDimension(report.pothole_width_cm)}</dd></div>
      <div><dt>Luas lubang</dt><dd>${areaText}</dd></div>
      <div><dt>Laporan sekitar</dt><dd>${nearbyReports} dalam radius ${nearbyRadius} m</dd></div>
      <div><dt>Duplikat terkait</dt><dd>${duplicateCount}</dd></div>
      <div><dt>Waktu laporan</dt><dd>${escapeHtml(formatTimestamp(report.created_at))}</dd></div>
      <div><dt>Koordinat</dt><dd>${escapeHtml(coordinateText)}</dd></div>
    </dl>
    <p class="detail-description">${escapeHtml(report.description || "Tidak ada deskripsi.")}</p>
    ${report.status_reason ? `<p>Catatan petugas: ${escapeHtml(report.status_reason)}</p>` : ""}
    ${afterPhoto}
    ${coordinatesAreValid
      ? `<button class="operator-secondary detail-route" type="button" data-route-to="${Number(report.latitude)},${Number(report.longitude)}">Rute ke lokasi</button>`
      : ""}
  `;
}

export function renderReportPopup(report, road, duplicateCount) {
  const score = getRoadDamageScore(road);
  const roadDimensions = formatRoadDimensions(road);
  const roadDimensionsStatus = roadDimensions
    ? road.dimensions_verified ? "Diverifikasi petugas" : "Nilai default; menunggu verifikasi"
    : "Belum tersedia";
  const statusClass = report.status === "Verifikasi" ? " is-verification" : "";
  const address = report.address && report.address !== report.road_name
    ? `<p class="map-popup-address">${escapeHtml(report.address)}</p>`
    : "";
  return `
    <div class="map-popup">
      ${safePhoto(report.photo_url, "Foto laporan")}
      <h3>${escapeHtml(report.road_name || report.address || "Laporan jalan")}</h3>
      ${address}
      <span class="map-popup-status${statusClass}">${escapeHtml(report.status || "Status tidak tersedia")}</span>
      <p>${escapeHtml(report.description || "Tidak ada deskripsi.")}</p>
      <div class="map-popup-meta">
        <span>Prioritas</span><strong>${road?.damage_percentage == null ? "Belum dihitung" : `${Number(road.damage_percentage).toFixed(2)}% · skor ${score}/10`}</strong>
        <span>Dimensi jalan</span><strong>${escapeHtml(roadDimensions || "Belum tersedia")} · ${roadDimensionsStatus}</strong>
        <span>Severity</span><strong>${escapeHtml(report.damage_level || "Belum terukur")}</strong>
        <span>Duplikat</span><strong>${duplicateCount}</strong>
      </div>
    </div>
  `;
}
