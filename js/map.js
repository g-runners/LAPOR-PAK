import { getCurrentProfile, ensureAnonymousSession } from "./auth.js";
import { NEARBY_RADIUS_METERS } from "./supabase-config.js";
import { fetchReports, fetchRoadPriorities, submitRating } from "./storage.js";
import { initializeNavigation } from "./ui.js";
import { exportReportsAndStats } from "./export.js";
import { hasCoordinates, nearbyCount } from "./report-priority.js";
import {
  buildRoadGroups,
  escapeHtml,
  filterReports,
  formatRoadDimensions,
  getPriorityColor,
  getRoadDamageScore,
  getRoadGroupKey
} from "./map/priority.js";
import { renderReportDetails } from "./map/details.js";
import { createReportMarker, focusMarker } from "./map/markers.js";
import { attachMapRouting } from "./map/routing.js";

initializeNavigation();

const mapSidebar = document.getElementById("map-sidebar");
const sidebarToggle = document.getElementById("map-sidebar-toggle");
const sidebarClose = document.getElementById("map-sidebar-close");
const mobileSidebar = window.matchMedia("(max-width: 820px)");

function setMapSidebarOpen(open) {
  const isMobile = mobileSidebar.matches;
  const isOpen = isMobile ? open : true;
  document.body.classList.toggle("map-sidebar-open", isMobile && isOpen);
  mapSidebar.inert = !isOpen;
  mapSidebar.setAttribute("aria-hidden", String(!isOpen));
  sidebarToggle.setAttribute("aria-expanded", String(isMobile && isOpen));
}

setMapSidebarOpen(!mobileSidebar.matches);
sidebarToggle.addEventListener("click", () => {
  setMapSidebarOpen(true);
  sidebarClose.focus();
});
sidebarClose.addEventListener("click", () => {
  setMapSidebarOpen(false);
  sidebarToggle.focus();
});
mobileSidebar.addEventListener("change", (event) => setMapSidebarOpen(!event.matches));

const mapMessage = document.getElementById("map-message");
const detail = document.getElementById("map-detail");
const ratingForm = document.getElementById("rating-form");
const ratingMessage = document.getElementById("rating-message");
const priorityList = document.getElementById("map-report-list");
const resultCount = document.getElementById("map-result-count");
const statusFilter = document.getElementById("map-status");
const severityFilter = document.getElementById("map-severity");
const searchInput = document.getElementById("map-search");
const map = window.L?.map
  ? L.map("report-map", { zoomControl: false }).setView([-6.2383, 106.9933], 12)
  : null;

if (map) {
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: "&copy; OpenStreetMap contributors"
  }).addTo(map);
  L.control.zoom({ position: "bottomright" }).addTo(map);
} else {
  document.getElementById("report-map").textContent = "Leaflet tidak termuat. Peta tidak tersedia.";
}

const markerLayer = map ? L.layerGroup().addTo(map) : null;
const routing = map ? attachMapRouting(map, mapMessage) : null;
let allReports = [];
let roadPriorities = [];
let activeReport = null;
let activeRoadKey = null;
let didFitInitialReports = false;
let markerByReportId = new Map();
let duplicateCounts = new Map();

function setMessage(element, text, type = "") {
  element.textContent = text;
  element.dataset.type = type;
}

function getFilters() {
  return {
    status: statusFilter.value,
    severity: severityFilter.value,
    query: searchInput.value
  };
}

function getDuplicateCount(report) {
  return duplicateCounts.get(String(report.id)) || 0;
}

function indexDuplicates() {
  duplicateCounts = new Map();
  for (const report of allReports) {
    if (!report.merged_into) continue;
    const parentId = String(report.merged_into);
    duplicateCounts.set(parentId, (duplicateCounts.get(parentId) || 0) + 1);
  }
}

function renderPriority(groups, matchingReports) {
  const matchingIds = new Set(matchingReports.map((report) => String(report.id)));
  const visibleGroups = groups
    .map((group) => ({
      ...group,
      reports: group.reports.filter((report) => matchingIds.has(String(report.id)))
    }))
    .filter((group) => group.reports.length > 0);

  if (activeRoadKey && !visibleGroups.some((group) => getRoadGroupKey(group.reports[0]) === activeRoadKey)) {
    activeRoadKey = null;
  }
  resultCount.textContent = String(matchingReports.length);
  if (!visibleGroups.length) {
    priorityList.innerHTML = '<div class="map-empty">Tidak ada laporan yang cocok dengan filter.</div>';
    return visibleGroups;
  }

  priorityList.innerHTML = visibleGroups.map((group) => {
    const key = getRoadGroupKey(group.reports[0]);
    const score = getRoadDamageScore(group);
    const color = getPriorityColor(score, group.reports[0].damage_level);
    const expanded = activeRoadKey === key;
    const scoreText = group.damage_percentage === null
      ? "Prioritas menunggu data ukuran"
      : `${group.damage_percentage.toFixed(2)}% · skor ${score}/10`;
    const formattedDimensions = formatRoadDimensions(group);
    const dimensions = formattedDimensions || "Dimensi jalan belum tersedia";
    const dimensionStatus = formattedDimensions
      ? (group.dimensions_verified ? "Diverifikasi petugas" : "Nilai default; menunggu verifikasi petugas")
      : "Belum tersedia";

    return `
      <article class="map-road-item${expanded ? " is-open" : ""}">
        <button class="map-road-heading" type="button" data-road-key="${escapeHtml(key)}" aria-expanded="${expanded}">
          <span class="map-road-name">${escapeHtml(group.name)}</span>
          <span class="map-road-score" style="color:${color}">${escapeHtml(scoreText)}</span>
        </button>
        <div class="map-road-summary">
          <span>${group.reports.length} laporan · ${group.nearby_count} sekitar</span>
          <span>${escapeHtml(dimensions)}</span>
          <span>${dimensionStatus}</span>
          ${group.duplicate_count ? `<span>${group.duplicate_count} laporan terkait</span>` : ""}
        </div>
        <div class="map-road-reports">
          ${group.reports.map((report) => `
            <button type="button" class="map-report-item" data-report-id="${escapeHtml(report.id)}"
              aria-current="${activeReport && String(activeReport.id) === String(report.id)}">
              <span class="severity-dot" style="background:${getPriorityColor(score, report.damage_level)}" aria-hidden="true"></span>
              <span class="map-report-copy">
                <strong>${escapeHtml(report.address || report.description || "Laporan jalan")}</strong>
                <small>${escapeHtml(report.status || "Status tidak tersedia")} · ${escapeHtml(report.damage_level || "Belum terukur")} · ${getDuplicateCount(report)} duplikat</small>
              </span>
              <span class="map-report-chevron" aria-hidden="true">›</span>
            </button>
          `).join("")}
        </div>
      </article>
    `;
  }).join("");
  return visibleGroups;
}

function renderMarkers(reports, groups) {
  if (!map || !markerLayer) return [];
  markerLayer.clearLayers();
  markerByReportId = new Map();
  const groupsByReportId = new Map();
  for (const group of groups) {
    for (const report of group.reports) groupsByReportId.set(String(report.id), group);
  }
  const located = reports.filter(hasCoordinates);
  const markerReports = activeRoadKey
    ? located.filter((report) => getRoadGroupKey(report) === activeRoadKey)
    : located;

  for (const report of markerReports) {
    const group = groupsByReportId.get(String(report.id));
    let marker;
    marker = createReportMarker(report, group, getDuplicateCount(report), () => {
      activeReport = report;
      renderDetail(report, group);
      renderPriority(buildRoadGroups(allReports, roadPriorities), filterReports(allReports, getFilters()));
    });
    marker.addTo(markerLayer);
    markerByReportId.set(String(report.id), marker);
  }

  if (!didFitInitialReports && located.length) {
    const points = located.map((report) => [Number(report.latitude), Number(report.longitude)]);
    if (points.length === 1) map.setView(points[0], 15);
    else map.fitBounds(points, { padding: [24, 24], maxZoom: 16 });
    didFitInitialReports = true;
  }
  return markerReports;
}

function roadGroups() {
  return buildRoadGroups(allReports, roadPriorities);
}

function renderDetail(report, road) {
  activeReport = report || null;
  if (!report) {
    renderReportDetails(detail, null, null, 0, 0);
    ratingForm.hidden = true;
    return;
  }

  const rootReports = allReports.filter((candidate) => !candidate.merged_into);
  renderReportDetails(
    detail,
    report,
    road || roadGroups().find((group) => group.reports.some((member) => String(member.id) === String(report.id))),
    getDuplicateCount(report),
    nearbyCount(report, rootReports, NEARBY_RADIUS_METERS),
    NEARBY_RADIUS_METERS
  );
  ratingForm.hidden = report.status !== "Selesai";
  setMessage(ratingMessage, "");
}

function renderFiltered() {
  const matchingReports = filterReports(allReports, getFilters());
  const groups = roadGroups();
  const visibleGroups = renderPriority(groups, matchingReports);
  const visibleMarkers = renderMarkers(matchingReports, groups);
  if (!matchingReports.length) {
    setMessage(mapMessage, "Tidak ada laporan yang cocok dengan filter.", "warning");
  } else {
    setMessage(
      mapMessage,
      `${matchingReports.length} laporan · ${visibleMarkers.length} pin ditampilkan · ${visibleGroups.length} jalan.`,
      "success"
    );
  }
  if (activeReport && !matchingReports.some((report) => String(report.id) === String(activeReport.id))) {
    renderDetail(null, null);
  }
}

function selectReport(reportId) {
  const report = allReports.find((item) => String(item.id) === String(reportId));
  if (!report) return;
  const group = roadGroups().find((item) => item.reports.some((member) => String(member.id) === String(report.id)));
  activeReport = report;
  renderDetail(report, group);
  renderPriority(roadGroups(), filterReports(allReports, getFilters()));
  const marker = markerByReportId.get(String(report.id));
  if (map && hasCoordinates(report)) {
    if (marker) focusMarker(map, marker);
    else map.setView([Number(report.latitude), Number(report.longitude)], Math.max(map.getZoom(), 16));
  }
}

function getExportReports() {
  const { status, severity, query } = getFilters();
  const normalizedQuery = query.trim().toLocaleLowerCase("id");
  return allReports.filter((report) => {
    if (status && report.status !== status) return false;
    if (severity && report.damage_level !== severity) return false;
    return `${report.road_name || ""} ${report.address || ""} ${report.description || ""} ${report.id}`
      .toLocaleLowerCase("id").includes(normalizedQuery);
  });
}

for (const filter of [statusFilter, severityFilter]) filter.addEventListener("change", renderFiltered);
searchInput.addEventListener("input", renderFiltered);

priorityList.addEventListener("click", (event) => {
  const reportButton = event.target.closest("[data-report-id]");
  if (reportButton) {
    selectReport(reportButton.dataset.reportId);
    return;
  }
  const roadButton = event.target.closest("[data-road-key]");
  if (!roadButton) return;
  const roadKey = roadButton.dataset.roadKey;
  activeRoadKey = activeRoadKey === roadKey ? null : roadKey;
  renderFiltered();
  if (activeRoadKey && map) {
    const reports = filterReports(allReports, getFilters())
      .filter((report) => getRoadGroupKey(report) === activeRoadKey && hasCoordinates(report));
    if (reports.length === 1) map.setView([Number(reports[0].latitude), Number(reports[0].longitude)], 16);
    else if (reports.length > 1) {
      map.fitBounds(reports.map((report) => [Number(report.latitude), Number(report.longitude)]), {
        padding: [24, 24],
        maxZoom: 16
      });
    }
  }
});

detail.addEventListener("click", (event) => {
  const routeButton = event.target.closest("[data-route-to]");
  if (!routeButton || !routing) return;
  const [latitude, longitude] = routeButton.dataset.routeTo.split(",");
  routing.showRoute(latitude, longitude);
});

document.getElementById("export-csv").addEventListener("click", () => {
  try {
    exportReportsAndStats(getExportReports());
    setMessage(mapMessage, "CSV laporan dan statistik berhasil diunduh.", "success");
  } catch (error) {
    setMessage(mapMessage, error.message, "error");
  }
});

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
    const ratingUser = user && !user.is_anonymous ? user : await ensureAnonymousSession();
    await submitRating(activeReport.id, ratingUser.id, score);
    setMessage(ratingMessage, "Terima kasih, penilaian berhasil dikirim.", "success");
    ratingForm.reset();
  } catch (error) {
    setMessage(ratingMessage, `Penilaian gagal: ${error.message}`, "error");
    console.error("Pengiriman rating gagal:", error);
  }
});

document.getElementById("map-locate").addEventListener("click", () => {
  if (routing) routing.locateUser();
  else setMessage(mapMessage, "Lokasi tidak dapat ditampilkan karena peta belum tersedia.", "error");
});
document.getElementById("map-hide-route").addEventListener("click", () => {
  routing?.hideRoute();
  setMessage(mapMessage, "Rute pada peta disembunyikan.");
});

async function loadMapData() {
  setMessage(mapMessage, "Memuat laporan…");
  if (!map) {
    setMessage(mapMessage, "Peta tidak dapat dimuat karena Leaflet CDN tidak tersedia.", "error");
    return;
  }

  const [reportsResult, prioritiesResult] = await Promise.allSettled([
    fetchReports(),
    fetchRoadPriorities()
  ]);
  if (reportsResult.status === "rejected") {
    priorityList.innerHTML = "";
    setMessage(mapMessage, `Laporan gagal dimuat: ${reportsResult.reason.message}. Periksa policy SELECT/RLS.`, "error");
    console.error("Pemuatan laporan peta gagal:", reportsResult.reason);
    return;
  }

  allReports = reportsResult.value;
  indexDuplicates();
  if (prioritiesResult.status === "fulfilled") {
    roadPriorities = prioritiesResult.value;
  } else {
    roadPriorities = [];
    setMessage(mapMessage, `Data laporan dimuat, tetapi prioritas jalan gagal dibaca: ${prioritiesResult.reason.message}. Jalankan migrasi SQL prioritas jalan.`, "error");
    console.error("Pemuatan prioritas jalan gagal:", prioritiesResult.reason);
  }
  renderFiltered();
  if (!allReports.length) setMessage(mapMessage, "Data laporan belum tersedia.");
  else if (prioritiesResult.status === "rejected") {
    setMessage(mapMessage, `Laporan dimuat tanpa skor prioritas: ${prioritiesResult.reason.message}. Jalankan migrasi SQL prioritas jalan.`, "error");
  }
}

loadMapData().catch((error) => {
  setMessage(mapMessage, `Pemuatan peta gagal: ${error.message}`, "error");
  console.error("Inisialisasi peta gagal:", error);
});
