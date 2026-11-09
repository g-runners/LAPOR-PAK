export function hasCoordinates(report) {
  if (report.latitude === null || report.latitude === undefined || report.latitude === "" ||
      report.longitude === null || report.longitude === undefined || report.longitude === "") return false;
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

export function nearbyCount(report, reports, radiusMeters) {
  if (!hasCoordinates(report)) return 0;
  return reports.filter((other) =>
    other.id !== report.id && hasCoordinates(other) &&
    distanceMeters(report, other) <= radiusMeters
  ).length;
}

export function sortReportsByPriority(reports, radiusMeters, nearbyReports = reports) {
  const levelRank = { Parah: 3, Sedang: 2, Ringan: 1 };
  return [...reports].sort((first, second) =>
    (levelRank[second.damage_level] || 0) - (levelRank[first.damage_level] || 0) ||
    nearbyCount(second, nearbyReports, radiusMeters) - nearbyCount(first, nearbyReports, radiusMeters) ||
    (Date.parse(second.created_at || "") || 0) - (Date.parse(first.created_at || "") || 0)
  );
}
