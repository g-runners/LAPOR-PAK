import { escapeHtml, getPriorityColor, getRoadDamageScore } from "./priority.js";
import { renderReportPopup } from "./details.js";

export function createReportMarker(report, road, duplicateCount, onSelect) {
  const color = getPriorityColor(getRoadDamageScore(road), report.damage_level);
  const verificationRing = report.status === "Verifikasi"
    ? 'stroke="#1d2b29" stroke-dasharray="2 2"'
    : 'stroke="#fff"';
  const duplicateBadge = duplicateCount > 0
    ? `<span class="lp-marker-count" aria-label="${duplicateCount} laporan duplikat">${duplicateCount}</span>`
    : "";
  const icon = L.divIcon({
    className: "lp-marker-icon",
    html: `
      <span class="lp-marker" role="img" aria-label="${escapeHtml(report.status || "Laporan")}">
        <svg viewBox="0 0 32 42" aria-hidden="true">
          <path d="M16 0C7.2 0 0 7.2 0 16c0 12.5 16 26 16 26S32 28.5 32 16C32 7.2 24.8 0 16 0Z" fill="${color}" stroke="#fff" stroke-width="2"/>
          <circle cx="16" cy="16" r="6" fill="#fff" ${verificationRing} stroke-width="1.5"/>
        </svg>
        ${duplicateBadge}
      </span>
    `,
    iconSize: [42, 48],
    iconAnchor: [21, 43],
    popupAnchor: [0, -39]
  });

  const marker = L.marker([Number(report.latitude), Number(report.longitude)], {
    icon,
    riseOnHover: true
  }).bindPopup(renderReportPopup(report, road, duplicateCount), {
    maxWidth: 310,
    minWidth: 230,
    autoPanPadding: [28, 28]
  });

  marker.bindTooltip(
    `${report.road_name || report.address || "Laporan"} · ${report.status || "Status tidak tersedia"}`,
    { direction: "top", offset: [0, -34] }
  );
  marker.on("click", () => onSelect(report));
  return marker;
}

export function focusMarker(map, marker) {
  if (!map || !marker) return;
  const target = marker.getLatLng();
  marker.openPopup();
  window.setTimeout(() => {
    try {
      const size = map.getSize();
      const point = map.latLngToContainerPoint(target);
      const desired = L.point(size.x * 0.7, size.y * 0.71);
      const center = L.point(size.x / 2, size.y / 2);
      const newCenter = map.containerPointToLatLng(center.add(point.subtract(desired)));
      map.panTo(newCenter, { animate: true });
    } catch (error) {
      console.warn("Pergeseran fokus pin gagal; memakai posisi standar.", error);
      map.panTo(target, { animate: true });
    }
  }, 50);
}
