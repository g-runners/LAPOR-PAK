import { requireRole } from "./auth.js";
import {
  fetchReports, fetchRoadPriorities, removePhoto,
  updateReport, updateRoadDimensions, uploadPhoto
} from "./storage.js";
import { initializeNavigation } from "./ui.js";

initializeNavigation();

const message = document.getElementById("admin-message");
const reportRows = document.getElementById("admin-report-rows");
const statusFilter = document.getElementById("admin-status-filter");
const adminContent = document.getElementById("admin-content");
const reportCount = document.getElementById("admin-report-count");
const roadRows = document.getElementById("road-dimension-rows");
const roadsMessage = document.getElementById("roads-message");
const statuses = ["Verifikasi", "Belum Ditangani", "Dalam Proses Perbaikan", "Selesai"];
let reports = [];

function setMessage(element, text, type = "") {
  element.textContent = text;
  element.classList.toggle("error", type === "error");
  element.classList.toggle("success", type === "success");
  element.hidden = !text;
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[character]);
}

function validateImage(file) {
  if (!file) throw new Error("Pilih foto JPG atau PNG.");
  if (!["image/jpeg", "image/png"].includes(file.type)) throw new Error("Foto harus JPG atau PNG.");
  if (file.size > 5 * 1024 * 1024) throw new Error("Ukuran foto maksimal 5 MB.");
}

function renderStats() {
  const counts = {
    total: reports.length,
    pending: reports.filter((report) => ["Verifikasi", "Belum Ditangani"].includes(report.status)).length,
    processing: reports.filter((report) => report.status === "Dalam Proses Perbaikan").length,
    completed: reports.filter((report) => report.status === "Selesai").length
  };
  for (const [key, count] of Object.entries(counts)) {
    const target = document.querySelector(`[data-stat="${key}"]`);
    if (target) target.textContent = String(count);
  }
}

function renderReports() {
  const selectedStatus = statusFilter.value;
  const visible = selectedStatus ? reports.filter((report) => report.status === selectedStatus) : reports;
  reportCount.textContent = `${visible.length} laporan`;
  if (!visible.length) {
    reportRows.innerHTML = '<div class="map-empty">Belum ada laporan yang masuk.</div>';
    return;
  }

  reportRows.innerHTML = visible.map((report) => {
    const parentOptions = reports.filter((candidate) => candidate.id !== report.id).map((candidate) =>
      `<option value="${escapeHtml(candidate.id)}">${escapeHtml(candidate.id)} · ${escapeHtml(candidate.address || "Laporan")}</option>`
    ).join("");
    const selectedStatusOptions = statuses.map((status) =>
      `<option value="${escapeHtml(status)}" ${status === report.status ? "selected" : ""}>${escapeHtml(status)}</option>`
    ).join("");
    return `
      <article class="operator-report" data-row-id="${escapeHtml(report.id)}">
        <div class="operator-report-summary">
          ${report.photo_url ? `<img src="${escapeHtml(report.photo_url)}" alt="Foto laporan" loading="lazy">` : ""}
          <div>
            <span class="severity-tag">Kerusakan ${escapeHtml(report.damage_level || "belum terukur")}</span>
            <h3>${escapeHtml(report.address || "Lokasi laporan")}</h3>
            <p>${escapeHtml(report.address || "Lokasi tidak diisi")} · ${escapeHtml(report.id)}</p>
            <p>${escapeHtml(report.description || "Tidak ada deskripsi")}</p>
            ${report.status_reason ? `<p>Alasan: ${escapeHtml(report.status_reason)}</p>` : ""}
            ${report.merged_into ? `<p>Duplikat dari ID ${escapeHtml(report.merged_into)}</p>` : ""}
          </div>
        </div>
        <div class="operator-form">
          <label class="map-field">Status
            <select data-status-select>${selectedStatusOptions}</select>
          </label>
          <label class="map-field">Laporan induk jika ganda
            <select data-merge-parent>
              <option value="">Pilih ID laporan induk</option>${parentOptions}
            </select>
          </label>
          <div class="operator-form-actions field-wide">
            <button class="operator-primary" type="button" data-action="status">Simpan status</button>
            <button class="operator-secondary" type="button" data-action="reason">Catat tidak wajar</button>
            <button class="operator-secondary" type="button" data-action="merge">Tandai duplikat</button>
          </div>
          ${report.status === "Selesai" ? `
            <label class="map-field field-wide">Foto bukti perbaikan
              <input data-after-photo type="file" accept="image/jpeg,image/png">
              ${report.after_photo_url ? `<a class="proof-link" href="${escapeHtml(report.after_photo_url)}" target="_blank" rel="noopener">Lihat foto tersimpan</a>` : ""}
            </label>` : ""}
        </div>
      </article>
    `;
  }).join("");
}

async function loadReports() {
  reportRows.innerHTML = '<div class="map-empty">Memuat laporan…</div>';
  try {
    reports = await fetchReports();
    renderStats();
    renderReports();
    setMessage(message, `${reports.length} laporan dimuat.`, "success");
  } catch (error) {
    setMessage(message, `Laporan gagal dimuat: ${error.message}. Periksa policy SELECT/RLS.`, "error");
    reportRows.innerHTML = "";
    console.error("Admin gagal memuat laporan:", error);
  }
}

function renderRoads(roads) {
  if (!roads.length) {
    roadRows.innerHTML = '<div class="map-empty">Belum ada nama jalan dari laporan. Jalan akan tercatat setelah laporan memiliki nama jalan.</div>';
    return;
  }

  roadRows.innerHTML = roads.map((road) => `
    <article class="operator-report" data-road-id="${escapeHtml(road.road_id)}">
      <div class="operator-report-summary">
        <div>
          <h3>${escapeHtml(road.name)}</h3>
          <p>${Number(road.report_count) || 0} laporan · ${Number(road.measured_reports) || 0} laporan memiliki perkiraan ukuran</p>
          <p>Kerusakan jalan: ${road.damage_percentage === null ? "Belum dapat dihitung" : `${Number(road.damage_percentage).toFixed(2)}%`} · Skor prioritas: ${road.damage_score ?? "-"}/10</p>
          <p>${road.dimensions_verified ? "Dimensi sudah diverifikasi petugas." : "Dimensi masih nilai default 100 m × 5 m dan perlu diverifikasi petugas."}</p>
        </div>
      </div>
      <form class="operator-form" data-road-form>
        <label class="map-field">Panjang jalan (m)
          <input name="length_m" type="number" min="0.01" step="0.01" value="${Number(road.length_cm ?? 10000) / 100}" required>
        </label>
        <label class="map-field">Lebar jalan (m)
          <input name="width_m" type="number" min="0.01" step="0.01" value="${Number(road.width_cm ?? 500) / 100}" required>
        </label>
        <div class="operator-form-actions field-wide">
          <button class="operator-primary" type="submit">Simpan verifikasi dimensi</button>
        </div>
      </form>
    </article>
  `).join("");
}

async function loadRoads() {
  roadRows.innerHTML = '<div class="map-empty">Memuat daftar jalan…</div>';
  try {
    const roads = await fetchRoadPriorities();
    renderRoads(roads);
    setMessage(roadsMessage, `${roads.length} jalan dimuat.`, "success");
  } catch (error) {
    roadRows.innerHTML = "";
    setMessage(roadsMessage, `Dimensi jalan gagal dimuat: ${error.message}. Jalankan sql/add_road_priority.sql dan periksa policy RLS.`, "error");
    console.error("Dimensi jalan gagal dimuat:", error);
  }
}

function getReportFromRow(row) {
  return reports.find((report) => String(report.id) === row.dataset.rowId);
}

async function updateStatus(row) {
  const report = getReportFromRow(row);
  const newStatus = row.querySelector("[data-status-select]").value;
  if (!report || newStatus === report.status) return;

  const oldIndex = statuses.indexOf(report.status);
  const newIndex = statuses.indexOf(newStatus);
  if (newIndex !== oldIndex + 1 && !window.confirm(
    `Perubahan ${report.status} → ${newStatus} tidak berurutan. Tetap simpan?`
  )) return;

  await updateReport(report.id, { status: newStatus });
  setMessage(message, `Status laporan ${report.id} diperbarui. Riwayat dicatat oleh trigger database.`, "success");
}

async function recordUnreasonable(row) {
  const report = getReportFromRow(row);
  const reason = window.prompt("Jelaskan alasan laporan dinilai tidak wajar (wajib):", "");
  if (reason === null) return;
  if (!reason.trim()) throw new Error("Alasan wajib diisi; status tidak diubah.");
  await updateReport(report.id, { status_reason: reason.trim() });
  setMessage(message, `Alasan tersimpan untuk laporan ${report.id}; status tetap ${report.status}.`, "success");
}

async function mergeDuplicate(row) {
  const report = getReportFromRow(row);
  const parentId = row.querySelector("[data-merge-parent]").value;
  if (!parentId) throw new Error("Pilih laporan induk.");
  if (String(parentId) === String(report.id)) throw new Error("Laporan tidak dapat digabungkan ke dirinya sendiri.");
  if (!window.confirm(`Tandai laporan ${report.id} sebagai duplikat dari ${parentId}?`)) return;
  await updateReport(report.id, { merged_into: parentId });
  setMessage(message, `Laporan ${report.id} dikaitkan ke laporan induk ${parentId}.`, "success");
}

async function saveAfterPhoto(row, input) {
  const report = getReportFromRow(row);
  const file = input.files?.[0];
  if (!file) return;
  validateImage(file);
  const uploaded = await uploadPhoto(file, "after");
  try {
    await updateReport(report.id, { after_photo_url: uploaded.publicUrl });
  } catch (error) {
    try {
      await removePhoto(uploaded.path);
    } catch (cleanupError) {
      throw new Error(`${error.message} Foto setelah perbaikan juga gagal dibersihkan: ${cleanupError.message}`);
    }
    throw error;
  }
  setMessage(message, `Foto setelah perbaikan laporan ${report.id} tersimpan.`, "success");
}

reportRows.addEventListener("click", async (event) => {
  const button = event.target.closest("[data-action]");
  if (!button) return;
  const row = button.closest("[data-row-id]");
  try {
    if (button.dataset.action === "status") await updateStatus(row);
    if (button.dataset.action === "reason") await recordUnreasonable(row);
    if (button.dataset.action === "merge") await mergeDuplicate(row);
    await loadReports();
  } catch (error) {
    setMessage(message, `Operasi ditolak/gagal: ${error.message}`, "error");
    console.error("Operasi laporan gagal:", error);
  }
});

reportRows.addEventListener("change", async (event) => {
  const input = event.target.closest("[data-after-photo]");
  if (!input) return;
  const row = input.closest("[data-row-id]");
  try {
    await saveAfterPhoto(row, input);
    await loadReports();
  } catch (error) {
    setMessage(message, `Foto perbaikan gagal disimpan: ${error.message}`, "error");
    console.error("Unggah foto perbaikan gagal:", error);
  }
});

statusFilter.addEventListener("change", renderReports);
document.getElementById("refresh-admin").addEventListener("click", loadReports);
document.getElementById("refresh-roads").addEventListener("click", loadRoads);
roadRows.addEventListener("submit", async (event) => {
  const form = event.target.closest("[data-road-form]");
  if (!form) return;
  event.preventDefault();
  const row = form.closest("[data-road-id]");
  const button = form.querySelector('button[type="submit"]');
  button.disabled = true;
  try {
    await updateRoadDimensions(
      row.dataset.roadId,
      Number(form.elements.length_m.value),
      Number(form.elements.width_m.value)
    );
    setMessage(roadsMessage, "Dimensi jalan berhasil diperbarui.", "success");
    await loadRoads();
  } catch (error) {
    setMessage(roadsMessage, `Dimensi jalan gagal diperbarui: ${error.message}`, "error");
    console.error("Pembaruan dimensi jalan gagal:", error);
  } finally {
    button.disabled = false;
  }
});
window.addEventListener("report-created", () => {
  void Promise.all([loadReports(), loadRoads()]);
});

try {
  const result = await requireRole(["petugas", "super_admin"]);
  if (result) {
    adminContent.hidden = false;
    await Promise.all([loadReports(), loadRoads()]);
  }
} catch (error) {
  setMessage(message, `Akses admin gagal: ${error.message}`, "error");
  adminContent.hidden = false;
  console.error("Pemeriksaan akses admin gagal:", error);
}
