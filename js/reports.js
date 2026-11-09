import { ensureAnonymousSession, getCurrentProfile } from "./auth.js";
import { detectRoadDamage } from "./detector.js";
import { reverseGeocode } from "./geocoding.js";
import { insertReport, removePhoto, uploadPhoto } from "./storage.js";
import { hideModal, showModal } from "./ui.js";

const DEFAULT_CAMERA_HEIGHT_CM = 50;
const form = document.getElementById("report-form");
const photoInput = document.getElementById("report-photo");
const cameraFileInput = document.getElementById("camera-file");
const preview = document.getElementById("photo-preview");
const heightInput = document.getElementById("camera-height");
const damageLevelInput = document.getElementById("damage-level");
const detectionMessage = document.getElementById("detection-result");
const measurementMessage = document.getElementById("damage-measurement");
const reportMessage = document.getElementById("form-error");
const locationMessage = document.getElementById("location-message");
const coordinatesInput = document.getElementById("report-coordinates");
const roadNameInput = document.getElementById("report-road-name");
const addressInput = document.getElementById("report-location");
const descriptionInput = document.getElementById("report-description");
const submitButton = form.querySelector('button[type="submit"]');
const successModal = document.getElementById("report-success-modal");
const cameraModal = document.getElementById("camera-modal");
const cameraVideo = document.getElementById("camera-video");
const cameraCanvas = document.getElementById("camera-canvas");
const cameraMessage = document.getElementById("camera-message");
const cameraCapture = document.getElementById("camera-capture");

let detection = null;
let marker = null;
let currentObjectUrl = "";
let detectionSequence = 0;
let geocodeSequence = 0;
let geocodeController = null;
let addressTouched = false;
let cameraStream = null;
let map = null;

function getCameraHeightCm() {
  return heightInput.value.trim() ? Number(heightInput.value) : DEFAULT_CAMERA_HEIGHT_CM;
}

function setMessage(element, text, type = "") {
  element.textContent = text;
  element.dataset.type = type;
}

function closeSuccessModal() {
  hideModal(successModal);
  document.body.classList.remove("modal-open");
  document.querySelector(".welcome-row [data-open-form]")?.focus();
}

function validCoordinates(latitude, longitude) {
  return Number.isFinite(latitude) && Number.isFinite(longitude) &&
    latitude >= -90 && latitude <= 90 && longitude >= -180 && longitude <= 180;
}

async function updateAddressFromCoordinates(latitude, longitude) {
  const sequence = ++geocodeSequence;
  geocodeController?.abort();
  geocodeController = new AbortController();
  setMessage(locationMessage, "Mencari alamat berdasarkan titik lokasi…");

  try {
    const result = await reverseGeocode(latitude, longitude, geocodeController.signal);
    if (sequence !== geocodeSequence) return;
    if (result.roadName) roadNameInput.value = result.roadName;
    else roadNameInput.value = addressInput.value.trim();
    if (!addressTouched && result.address) addressInput.value = result.address;
    setMessage(
      locationMessage,
      result.address ? "Alamat ditemukan dari titik lokasi; Anda tetap dapat mengubahnya." :
        "Nama jalan tidak ditemukan. Silakan isi alamat secara manual.",
      result.address ? "success" : "warning"
    );
  } catch (error) {
    if (sequence !== geocodeSequence || error.name === "AbortError") return;
    roadNameInput.value = addressInput.value.trim();
    setMessage(locationMessage, `Alamat otomatis tidak tersedia: ${error.message}. Isi alamat secara manual.`, "warning");
    console.warn("Reverse geocoding gagal:", error);
  }
}

function setCoordinates(latitude, longitude, zoom = 16) {
  coordinatesInput.value = `${latitude.toFixed(6)}, ${longitude.toFixed(6)}`;
  const point = [latitude, longitude];
  if (marker) marker.setLatLng(point);
  else if (map) marker = L.marker(point).addTo(map);
  map?.setView(point, zoom);
  updateAddressFromCoordinates(latitude, longitude);
}

if (window.L?.map) {
  map = L.map("location-map").setView([-6.2383, 106.9933], 12);
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: "&copy; OpenStreetMap contributors"
  }).addTo(map);
  map.on("click", (event) => setCoordinates(event.latlng.lat, event.latlng.lng));
  document.getElementById("map-status").textContent = "Ketuk peta untuk memilih titik lokasi.";
} else {
  document.getElementById("location-map").textContent = "Peta tidak dapat dimuat. Alamat atau koordinat tetap dapat diisi manual.";
  setMessage(locationMessage, "Peta tidak termuat; isi alamat secara manual.", "warning");
}

window.addEventListener("report-modal-open", () => window.setTimeout(() => map?.invalidateSize(), 50));
addressInput.addEventListener("input", () => {
  addressTouched = true;
  if (!roadNameInput.value) roadNameInput.value = addressInput.value.trim();
});

function validateImage(file) {
  if (!file) throw new Error("Pilih foto JPG atau PNG.");
  if (!["image/jpeg", "image/png"].includes(file.type)) throw new Error("Foto harus berformat JPG atau PNG.");
  if (file.size > 5 * 1024 * 1024) throw new Error("Ukuran foto maksimal 5 MB.");
}

async function runDetection() {
  const sequence = ++detectionSequence;
  const file = photoInput.files?.[0];
  detection = null;
  damageLevelInput.value = "";
  measurementMessage.textContent = "";
  if (!file) {
    setMessage(detectionMessage, "Deteksi akan berjalan setelah foto dipilih.");
    return;
  }

  try {
    validateImage(file);
    const cameraHeightCm = getCameraHeightCm();
    if (cameraHeightCm !== null && (!Number.isFinite(cameraHeightCm) || cameraHeightCm < 50 || cameraHeightCm > 300)) {
      throw new Error("Tinggi kamera harus antara 50 dan 300 cm.");
    }

    setMessage(detectionMessage, "Model deteksi sedang memeriksa foto…");
    detection = await detectRoadDamage(file, cameraHeightCm);
    if (sequence !== detectionSequence) return;
    if (!detection.detected) {
      setMessage(detectionMessage, "Model tidak menemukan pothole pada foto.", "warning");
      return;
    }

    const confidence = Math.round(detection.confidence * 100);
    if (detection.damageLevel) {
      damageLevelInput.value = detection.damageLevel;
      const { longestCm, widthCm } = detection.estimatedDimensions;
      measurementMessage.textContent = `Perkiraan ukuran ${longestCm.toFixed(1)} × ${widthCm.toFixed(1)} cm; hasil perlu diverifikasi petugas.`;
      setMessage(detectionMessage, `Pothole terdeteksi (${confidence}% confidence).`, "success");
    } else {
      setMessage(detectionMessage, `Pothole terdeteksi (${confidence}% confidence), tetapi ukuran belum dapat diperkirakan dari geometri foto.`, "warning");
    }
  } catch (error) {
    if (sequence !== detectionSequence) return;
    detection = null;
    setMessage(detectionMessage, `Deteksi gagal: ${error.message}`, "error");
  }
}

function clearPreview() {
  if (currentObjectUrl) URL.revokeObjectURL(currentObjectUrl);
  currentObjectUrl = "";
  preview.removeAttribute("src");
  preview.hidden = true;
}

photoInput.addEventListener("change", async () => {
  clearPreview();
  const file = photoInput.files?.[0];
  if (file) {
    currentObjectUrl = URL.createObjectURL(file);
    preview.src = currentObjectUrl;
    preview.hidden = false;
  }
  await runDetection();
});
cameraFileInput.addEventListener("change", () => {
  const file = cameraFileInput.files?.[0];
  if (!file) return;
  const transfer = new DataTransfer();
  transfer.items.add(file);
  photoInput.files = transfer.files;
  photoInput.dispatchEvent(new Event("change", { bubbles: true }));
});
heightInput.addEventListener("change", runDetection);

document.getElementById("locate-button").addEventListener("click", () => {
  if (!window.isSecureContext) {
    setMessage(locationMessage, "GPS di ponsel memerlukan koneksi HTTPS. Isi lokasi secara manual atau pilih titik di peta.", "error");
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

function stopCamera() {
  cameraStream?.getTracks().forEach((track) => track.stop());
  cameraStream = null;
  cameraVideo.srcObject = null;
  hideModal(cameraModal);
  if (document.getElementById("report-modal").hidden) {
    document.body.classList.remove("modal-open");
  }
}

document.getElementById("camera-button").addEventListener("click", async () => {
  if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
    cameraFileInput.click();
    return;
  }
  showModal(cameraModal);
  document.body.classList.add("modal-open");
  setMessage(cameraMessage, "Mengakses kamera…");
  try {
    cameraStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" }, audio: false });
    cameraVideo.srcObject = cameraStream;
    await cameraVideo.play();
    cameraCapture.disabled = false;
    setMessage(cameraMessage, "Arahkan kamera ke kondisi jalan yang ingin dilaporkan.");
  } catch (error) {
    stopCamera();
    setMessage(locationMessage, `Kamera tidak dapat dibuka: ${error.message}`, "error");
  }
});

cameraCapture.addEventListener("click", () => {
  if (!cameraVideo.videoWidth || !cameraVideo.videoHeight) {
    setMessage(cameraMessage, "Kamera belum siap. Coba lagi sebentar.");
    return;
  }
  cameraCanvas.width = cameraVideo.videoWidth;
  cameraCanvas.height = cameraVideo.videoHeight;
  cameraCanvas.getContext("2d").drawImage(cameraVideo, 0, 0);
  cameraCanvas.toBlob((blob) => {
    if (!blob) {
      setMessage(cameraMessage, "Foto dari kamera gagal diproses.", "error");
      return;
    }
    const file = new File([blob], `lapor-pak-${Date.now()}.jpg`, { type: "image/jpeg" });
    const transfer = new DataTransfer();
    transfer.items.add(file);
    photoInput.files = transfer.files;
    photoInput.dispatchEvent(new Event("change", { bubbles: true }));
    stopCamera();
  }, "image/jpeg", 0.92);
});
document.getElementById("camera-close").addEventListener("click", stopCamera);
document.getElementById("camera-cancel").addEventListener("click", stopCamera);
cameraModal.addEventListener("click", (event) => {
  if (event.target === cameraModal) stopCamera();
});
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && cameraModal.hidden === false) stopCamera();
  if (event.key === "Escape" && successModal.hidden === false) closeSuccessModal();
});
document.getElementById("report-success-close").addEventListener("click", closeSuccessModal);
document.getElementById("report-success-done").addEventListener("click", closeSuccessModal);
successModal.addEventListener("click", (event) => {
  if (event.target === successModal) closeSuccessModal();
});

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  setMessage(reportMessage, "");

  const file = photoInput.files?.[0];
  const description = descriptionInput.value.trim();
  const address = addressInput.value.trim();
  const coordinateParts = coordinatesInput.value.split(",").map((part) => part.trim());
  const latitude = coordinateParts.length === 2 ? Number(coordinateParts[0]) : null;
  const longitude = coordinateParts.length === 2 ? Number(coordinateParts[1]) : null;
  const hasCoordinates = coordinateParts.length === 2 && coordinateParts.every(Boolean);
  const cameraHeightCm = getCameraHeightCm();

  try {
    validateImage(file);
    if (!description) throw new Error("Deskripsi kerusakan wajib diisi.");
    if (!address && !hasCoordinates) throw new Error("Isi alamat atau tentukan titik di peta/GPS.");
    if (hasCoordinates && !validCoordinates(latitude, longitude)) throw new Error("Koordinat lokasi tidak valid.");
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
      road_name: roadNameInput.value.trim() || address || null,
      status: "Verifikasi",
      damage_level: detection?.damageLevel || null,
      camera_height_cm: cameraHeightCm,
      pothole_length_cm: detection?.estimatedDimensions?.lengthCm || null,
      pothole_width_cm: detection?.estimatedDimensions?.widthCm || null,
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

    window.dispatchEvent(new CustomEvent("report-created"));
    form.reset();
    detection = null;
    geocodeController?.abort();
    geocodeController = null;
    geocodeSequence += 1;
    addressTouched = false;
    damageLevelInput.value = "";
    clearPreview();
    if (marker) map.removeLayer(marker);
    marker = null;
    coordinatesInput.value = "";
    setMessage(locationMessage, "");
    setMessage(detectionMessage, "Deteksi akan berjalan setelah foto dipilih.");
    setMessage(reportMessage, "");
    hideModal(document.getElementById("report-modal"));
    successModal.style.zIndex = "10001";
    showModal(successModal);
    document.body.classList.add("modal-open");
    document.getElementById("report-success-done").focus();
  } catch (error) {
    setMessage(reportMessage, `Laporan belum terkirim: ${error.message}`, "error");
    console.error("Pengiriman laporan gagal:", error);
  } finally {
    submitButton.disabled = false;
    submitButton.innerHTML = 'Kirim laporan <span>→</span>';
  }
});
