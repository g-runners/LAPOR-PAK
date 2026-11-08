import { ensureAnonymousSession, getCurrentProfile } from "./auth.js";
import { detectRoadDamage } from "./detector.js";
import { fetchReports, insertReport, removePhoto, uploadPhoto } from "./storage.js";
import { initializeNavigation } from "./ui.js";

initializeNavigation();

const form = document.getElementById("report-form");
const photoInput = document.getElementById("photo");
const preview = document.getElementById("photo-preview");
const heightInput = document.getElementById("camera-height");
const damageLevelInput = document.getElementById("damage-level");
const detectionMessage = document.getElementById("detection-result");
const measurementMessage = document.getElementById("damage-measurement");
const reportMessage = document.getElementById("report-message");
const locationMessage = document.getElementById("location-message");
const successDialog = document.getElementById("report-success-dialog");
const closeSuccessDialog = document.getElementById("close-success-dialog");
const latitudeInput = document.getElementById("latitude");
const longitudeInput = document.getElementById("longitude");
const addressInput = document.getElementById("address");
const submitButton = document.getElementById("submit-report");

let detection = null;
let marker = null;
let currentObjectUrl = "";
let detectionSequence = 0;

closeSuccessDialog.addEventListener("click", () => successDialog.close());

function setMessage(element, text, type = "") {
  element.textContent = text;
  element.dataset.type = type;
}

function validCoordinates(latitude, longitude) {
  return Number.isFinite(latitude) && Number.isFinite(longitude) &&
    latitude >= -90 && latitude <= 90 && longitude >= -180 && longitude <= 180;
}

function setCoordinates(latitude, longitude, zoom = 16) {
  latitudeInput.value = latitude.toFixed(6);
  longitudeInput.value = longitude.toFixed(6);
  const point = [latitude, longitude];
  if (marker) marker.setLatLng(point);
  else marker = L.marker(point).addTo(map);
  map.setView(point, zoom);
  setMessage(locationMessage, "Titik lokasi terpilih.", "success");
}

let map = null;
if (window.L?.map) {
  map = L.map("report-map").setView([-6.2383, 106.9933], 12);
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: "&copy; OpenStreetMap contributors"
  }).addTo(map);
  map.on("click", (event) => setCoordinates(event.latlng.lat, event.latlng.lng));
} else {
  document.getElementById("report-map").textContent = "Peta tidak dapat dimuat. Alamat atau koordinat tetap dapat diisi manual.";
  setMessage(locationMessage, "Leaflet tidak termuat; gunakan alamat, koordinat, atau GPS.", "warning");
}

document.getElementById("use-location").addEventListener("click", () => {
  if (!window.isSecureContext) {
    setMessage(
      locationMessage,
      "GPS di ponsel memerlukan koneksi HTTPS. Buka situs melalui alamat HTTPS, atau isi alamat/koordinat secara manual.",
      "error"
    );
    return;
  }
  if (!navigator.geolocation) {
    setMessage(locationMessage, "Browser ini tidak menyediakan Geolocation API.", "error");
    return;
  }
  setMessage(locationMessage, "Mengambil lokasi perangkat…");
  navigator.geolocation.getCurrentPosition(
    (position) => setCoordinates(position.coords.latitude, position.coords.longitude),
    (error) => setMessage(locationMessage, `Lokasi tidak tersedia: ${error.message}`, "error"),
    { enableHighAccuracy: true, timeout: 12000, maximumAge: 0 }
  );
});

for (const input of [latitudeInput, longitudeInput]) {
  input.addEventListener("change", () => {
    const latitude = Number(latitudeInput.value);
    const longitude = Number(longitudeInput.value);
    if (latitudeInput.value && longitudeInput.value && validCoordinates(latitude, longitude)) {
      setCoordinates(latitude, longitude);
    }
  });
}

async function validateImage(file) {
  if (!file) throw new Error("Pilih foto bukti kerusakan.");
  if (file.size > 5 * 1024 * 1024) throw new Error("Ukuran foto maksimal 5 MB.");
  if (!["image/jpeg", "image/png"].includes(file.type)) {
    throw new Error("Foto harus berformat JPG atau PNG.");
  }

  const header = new Uint8Array(await file.slice(0, 8).arrayBuffer());
  const isJpeg = header[0] === 0xff && header[1] === 0xd8 && header[2] === 0xff;
  const isPng = [137, 80, 78, 71, 13, 10, 26, 10].every((value, index) => header[index] === value);
  if (!isJpeg && !isPng) throw new Error("Isi file tidak cocok dengan format JPG atau PNG.");
}

async function runDetection() {
  const sequence = ++detectionSequence;
  const file = photoInput.files?.[0];
  detection = null;
  damageLevelInput.value = "";
  measurementMessage.textContent = "Hasil deteksi hanya pendukung dan perlu pemeriksaan petugas.";
  if (!file) {
    setMessage(detectionMessage, "Pilih foto untuk menjalankan deteksi.");
    return;
  }

  try {
    await validateImage(file);
    const cameraHeightCm = heightInput.value ? Number(heightInput.value) : null;
    if (cameraHeightCm !== null && (cameraHeightCm < 50 || cameraHeightCm > 300)) {
      throw new Error("Tinggi kamera harus antara 50 dan 300 cm.");
    }

    setMessage(detectionMessage, "Model MORIS sedang memeriksa foto…");
    detection = await detectRoadDamage(file, cameraHeightCm);
    if (sequence !== detectionSequence) return;
    if (!detection.detected) {
      setMessage(detectionMessage, "Model tidak menemukan pothole pada foto.", "warning");
      return;
    }

    const confidence = Math.round(detection.confidence * 100);
    setMessage(detectionMessage, `Pothole terdeteksi (${confidence}% confidence).`, "success");
    if (detection.damageLevel) {
      damageLevelInput.value = detection.damageLevel;
      const { longestCm, widthCm } = detection.estimatedDimensions;
      measurementMessage.textContent =
        `Perkiraan ukuran ${longestCm.toFixed(1)} × ${widthCm.toFixed(1)} cm; model dan asumsi kamera tidak menggantikan pemeriksaan lapangan.`;
    } else {
      setMessage(
        detectionMessage,
        `Pothole terdeteksi (${confidence}% confidence), tetapi level belum dihitung. Masukkan tinggi kamera yang diperkirakan.`,
        "warning"
      );
    }
  } catch (error) {
    if (sequence !== detectionSequence) return;
    detection = null;
    setMessage(detectionMessage, `Deteksi gagal: ${error.message}`, "error");
  }
}

photoInput.addEventListener("change", async () => {
  if (currentObjectUrl) URL.revokeObjectURL(currentObjectUrl);
  const file = photoInput.files?.[0];
  if (file) {
    currentObjectUrl = URL.createObjectURL(file);
    preview.src = currentObjectUrl;
    preview.hidden = false;
  } else {
    preview.removeAttribute("src");
    preview.hidden = true;
  }
  await runDetection();
});

heightInput.addEventListener("change", runDetection);

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  setMessage(reportMessage, "");

  const file = photoInput.files?.[0];
  const description = document.getElementById("description").value.trim();
  const address = addressInput.value.trim();
  const latitudeText = latitudeInput.value.trim();
  const longitudeText = longitudeInput.value.trim();
  const cameraHeightCm = heightInput.value ? Number(heightInput.value) : null;
  const hasCoordinates = latitudeText !== "" && longitudeText !== "";
  const latitude = hasCoordinates ? Number(latitudeText) : null;
  const longitude = hasCoordinates ? Number(longitudeText) : null;

  try {
    await validateImage(file);
    if (!description) throw new Error("Deskripsi kerusakan wajib diisi.");
    if (!address && !hasCoordinates) throw new Error("Isi alamat atau tentukan titik GPS di peta.");
    if (hasCoordinates && !validCoordinates(latitude, longitude)) {
      throw new Error("Koordinat latitude/longitude tidak valid.");
    }
    if ((latitudeText && !longitudeText) || (!latitudeText && longitudeText)) {
      throw new Error("Isi latitude dan longitude secara bersamaan.");
    }
    if (cameraHeightCm !== null && (!Number.isFinite(cameraHeightCm) || cameraHeightCm < 50 || cameraHeightCm > 300)) {
      throw new Error("Tinggi kamera harus antara 50 dan 300 cm.");
    }

    const { user } = await getCurrentProfile();
    if (!user || user.is_anonymous) await ensureAnonymousSession();
    submitButton.disabled = true;
    submitButton.textContent = "Mengirim laporan…";

    const uploaded = await uploadPhoto(file);
    const report = {
      description,
      photo_url: uploaded.publicUrl,
      latitude,
      longitude,
      address: address || null,
      status: "Verifikasi",
      damage_level: detection?.damageLevel || null,
      camera_height_cm: cameraHeightCm,
      status_reason: null,
      merged_into: null,
      after_photo_url: null
    };

    try {
      await insertReport(report);
    } catch (insertError) {
      try {
        await removePhoto(uploaded.path);
      } catch (cleanupError) {
        throw new Error(`${insertError.message} Foto yang terunggah juga gagal dibersihkan: ${cleanupError.message}`);
      }
      throw insertError;
    }

    form.reset();
    detection = null;
    damageLevelInput.value = "";
    preview.removeAttribute("src");
    preview.hidden = true;
    if (currentObjectUrl) URL.revokeObjectURL(currentObjectUrl);
    currentObjectUrl = "";
    if (marker) {
      map.removeLayer(marker);
      marker = null;
    }
    setMessage(locationMessage, "");
    setMessage(detectionMessage, "Pilih foto untuk menjalankan deteksi.");
    setMessage(reportMessage, "Laporan berhasil dikirim dengan status Verifikasi.", "success");
    successDialog.showModal();
  } catch (error) {
    setMessage(reportMessage, `Laporan belum terkirim: ${error.message}`, "error");
    console.error("Pengiriman laporan gagal:", error);
  } finally {
    submitButton.disabled = false;
    submitButton.innerHTML = 'Kirim laporan <span aria-hidden="true">→</span>';
  }
});
