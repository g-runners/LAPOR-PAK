import { NEARBY_RADIUS_METERS } from "../supabase-config.js";
import { nearbyCount } from "../report-priority.js";

const DAMAGE_RANK = { Ringan: 1, Sedang: 2, Parah: 3 };

// Severity colors use the LAPOR PAK road-damage scale.
export function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[character]);
}

export function hasCoordinates(report) {
  if (report.latitude === null || report.latitude === undefined || report.latitude === "" ||
      report.longitude === null || report.longitude === undefined || report.longitude === "") return false;
  const latitude = Number(report.latitude);
  const longitude = Number(report.longitude);
  return Number.isFinite(latitude) && Number.isFinite(longitude) &&
    latitude >= -90 && latitude <= 90 && longitude >= -180 && longitude <= 180;
}

export function getDamageScore(value) {
  const percentage = Number(value);
  if (value === null || value === undefined || !Number.isFinite(percentage)) return null;
  return Math.min(10, Math.floor(percentage / 10) + 1);
}

export function getRoadDamageScore(road) {
  const score = nullableNumber(road?.damage_score);
  return score === null ? getDamageScore(road?.damage_percentage) : score;
}

export function getPriorityColor(score, damageLevel) {
  if (Number.isFinite(score)) {
    if (score <= 2) return "#4CAF50";
    if (score <= 5) return "#F6CC53";
    if (score <= 8) return "#FD884B";
    return "#E34053";
  }
  return ({ Ringan: "#4CAF50", Sedang: "#F6CC53", Parah: "#E34053" })[damageLevel] || "#FD884B";
}

function nullableNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

export function formatRoadDimensions(road) {
  const lengthCm = nullableNumber(road?.length_cm);
  const widthCm = nullableNumber(road?.width_cm);
  if (lengthCm === null || widthCm === null || lengthCm <= 0 || widthCm <= 0) return null;
  const formatMeters = (centimeters) =>
    (centimeters / 100).toLocaleString("id-ID", { maximumFractionDigits: 2 });
  return `${formatMeters(lengthCm)} × ${formatMeters(widthCm)} m`;
}

export function getRoadGroupKey(report) {
  if (report.road_id) return `road:${report.road_id}`;
  const name = String(report.road_name || report.address || "").trim().toLocaleLowerCase("id");
  return name ? `name:${name}` : `unassigned:${report.id}`;
}

function groupNearbyCount(reports) {
  return reports.reduce((total, report) =>
    total + nearbyCount(report, reports, NEARBY_RADIUS_METERS), 0);
}

function compareRoads(first, second) {
  const firstHasScore = first.damage_percentage !== null;
  const secondHasScore = second.damage_percentage !== null;
  if (firstHasScore !== secondHasScore) return firstHasScore ? -1 : 1;
  if (firstHasScore && first.damage_percentage !== second.damage_percentage) {
    return second.damage_percentage - first.damage_percentage;
  }
  if (first.nearby_count !== second.nearby_count) return second.nearby_count - first.nearby_count;
  const firstSeverity = Math.max(0, ...first.reports.map((report) => DAMAGE_RANK[report.damage_level] || 0));
  const secondSeverity = Math.max(0, ...second.reports.map((report) => DAMAGE_RANK[report.damage_level] || 0));
  return secondSeverity - firstSeverity || first.name.localeCompare(second.name, "id");
}

export function buildRoadGroups(reports, roadPriorities) {
  const visibleReports = reports.filter((report) => !report.merged_into);
  const duplicatesByParent = new Map();
  for (const report of reports) {
    if (!report.merged_into) continue;
    const parentId = String(report.merged_into);
    duplicatesByParent.set(parentId, (duplicatesByParent.get(parentId) || 0) + 1);
  }
  const groups = new Map();
  for (const report of visibleReports) {
    const key = getRoadGroupKey(report);
    if (!groups.has(key)) {
      groups.set(key, {
        id: report.road_id || key,
        name: report.road_name || report.address || "Lokasi belum dikelompokkan",
        road_id: report.road_id || null,
        reports: [],
        damage_percentage: null,
        damage_score: null,
        length_cm: null,
        width_cm: null,
        measured_reports: 0
      });
    }
    groups.get(key).reports.push(report);
  }

  const prioritiesById = new Map(roadPriorities.map((road) => [String(road.road_id), road]));
  for (const group of groups.values()) {
    const priority = group.road_id ? prioritiesById.get(String(group.road_id)) : null;
    if (priority) {
      group.name = priority.name || group.name;
      group.damage_percentage = nullableNumber(priority.damage_percentage);
      group.damage_score = nullableNumber(priority.damage_score);
      group.length_cm = nullableNumber(priority.length_cm);
      group.width_cm = nullableNumber(priority.width_cm);
      group.measured_reports = Number(priority.measured_reports) || 0;
    }
    group.nearby_count = groupNearbyCount(group.reports);
    group.duplicate_count = group.reports.reduce((count, report) =>
      count + (duplicatesByParent.get(String(report.id)) || 0), 0);
    group.reports.sort((first, second) =>
      (DAMAGE_RANK[second.damage_level] || 0) - (DAMAGE_RANK[first.damage_level] || 0) ||
      (Date.parse(second.created_at || "") || 0) - (Date.parse(first.created_at || "") || 0)
    );
  }

  return [...groups.values()].sort(compareRoads);
}

export function filterReports(reports, filters) {
  const query = filters.query.trim().toLocaleLowerCase("id");
  return reports.filter((report) => {
    if (report.merged_into) return false;
    if (filters.status && report.status !== filters.status) return false;
    if (filters.severity && report.damage_level !== filters.severity) return false;
    const text = `${report.road_name || ""} ${report.address || ""} ${report.description || ""} ${report.id}`
      .toLocaleLowerCase("id");
    return text.includes(query);
  });
}
