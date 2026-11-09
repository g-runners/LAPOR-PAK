function setMessage(element, text, type = "") {
  element.textContent = text;
  element.dataset.type = type;
}

function getCurrentPosition() {
  if (!window.isSecureContext) {
    return Promise.reject(new Error("Lokasi perangkat memerlukan koneksi HTTPS atau localhost."));
  }
  if (!navigator.geolocation) {
    return Promise.reject(new Error("Browser ini tidak menyediakan Geolocation API."));
  }

  return new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(
      (position) => resolve({
        latitude: position.coords.latitude,
        longitude: position.coords.longitude
      }),
      (error) => reject(new Error(`Lokasi tidak tersedia: ${error.message}`)),
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 0 }
    );
  });
}

export function attachMapRouting(map, messageElement) {
  let userMarker = null;
  let routeLine = null;

  async function locateUser() {
    try {
      const location = await getCurrentPosition();
      const point = [location.latitude, location.longitude];
      if (userMarker) userMarker.setLatLng(point);
      else {
        userMarker = L.circleMarker(point, {
          radius: 8,
          color: "#176d59",
          fillColor: "#e5f3ed",
          fillOpacity: 1,
          weight: 3
        }).addTo(map).bindTooltip("Lokasi Anda");
      }
      map.flyTo(point, 16, { duration: 0.8 });
      setMessage(messageElement, "Lokasi perangkat ditampilkan.", "success");
      return location;
    } catch (error) {
      setMessage(messageElement, error.message, "error");
      return null;
    }
  }

  async function showRoute(latitude, longitude) {
    const destinationLat = Number(latitude);
    const destinationLon = Number(longitude);
    if (!Number.isFinite(destinationLat) || !Number.isFinite(destinationLon)) {
      setMessage(messageElement, "Koordinat tujuan tidak valid.", "error");
      return;
    }

    const origin = await getCurrentPosition().catch((error) => {
      setMessage(messageElement, error.message, "error");
      return null;
    });
    if (!origin) return;

    const coordinates = `${origin.longitude},${origin.latitude};${destinationLon},${destinationLat}`;
    const url = `https://router.project-osrm.org/route/v1/driving/${coordinates}?overview=full&geometries=geojson&steps=false`;
    setMessage(messageElement, "Menghitung rute dengan OSRM…");
    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`Layanan rute mengembalikan HTTP ${response.status}.`);
      const data = await response.json();
      const route = data.routes?.[0];
      if (data.code !== "Ok" || !route?.geometry?.coordinates?.length) {
        throw new Error("Rute berkendara tidak ditemukan.");
      }
      const latLngs = route.geometry.coordinates.map(([lon, lat]) => [lat, lon]);
      if (routeLine) map.removeLayer(routeLine);
      routeLine = L.polyline(latLngs, {
        color: "#176d59",
        weight: 5,
        opacity: 0.85
      }).addTo(map);
      map.fitBounds(routeLine.getBounds(), { padding: [30, 30] });
      const distanceKm = (route.distance / 1000).toFixed(1);
      const durationMin = Math.round(route.duration / 60);
      setMessage(messageElement, `Rute OSRM: ${distanceKm} km · sekitar ${durationMin} menit.`, "success");
    } catch (error) {
      setMessage(messageElement, `Rute gagal dihitung: ${error.message}`, "error");
      console.error("Permintaan rute OSRM gagal:", error);
    }
  }

  function hideRoute() {
    if (routeLine) map.removeLayer(routeLine);
    routeLine = null;
  }

  return { locateUser, showRoute, hideRoute };
}
