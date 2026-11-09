const NOMINATIM_REVERSE_URL = "https://nominatim.openstreetmap.org/reverse";
let requestQueue = Promise.resolve();
let lastRequestTime = 0;

function wait(milliseconds, signal) {
  if (milliseconds <= 0) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const cleanup = () => signal?.removeEventListener("abort", onAbort);
    const timer = window.setTimeout(() => {
      cleanup();
      resolve();
    }, milliseconds);
    const onAbort = () => {
      window.clearTimeout(timer);
      cleanup();
      reject(new DOMException("Permintaan lokasi dibatalkan.", "AbortError"));
    };
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

async function requestReverseGeocode(latitude, longitude, signal) {
  const delay = Math.max(0, 1100 - (Date.now() - lastRequestTime));
  await wait(delay, signal);
  lastRequestTime = Date.now();

  const url = new URL(NOMINATIM_REVERSE_URL);
  url.search = new URLSearchParams({
    lat: String(latitude),
    lon: String(longitude),
    format: "jsonv2",
    addressdetails: "1",
    zoom: "18",
    "accept-language": "id"
  });

  const response = await fetch(url, {
    headers: { Accept: "application/json" },
    signal
  });
  if (!response.ok) throw new Error(`Layanan alamat mengembalikan HTTP ${response.status}.`);
  const data = await response.json();
  const parts = data.address || {};
  const roadName =
    parts.road || parts.pedestrian || parts.footway || parts.path ||
    parts.residential || parts.street || null;

  return {
    address: typeof data.display_name === "string" ? data.display_name : "",
    roadName
  };
}

export function reverseGeocode(latitude, longitude, signal) {
  const request = requestQueue.then(() =>
    requestReverseGeocode(latitude, longitude, signal)
  );
  requestQueue = request.catch(() => {});
  return request;
}
