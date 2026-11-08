import { getCurrentProfile, requireRole } from "./auth.js";
import { fetchProfiles, fetchReports, removePhoto, updateProfileRole, updateReport, uploadPhoto } from "./storage.js";
import { initializeNavigation } from "./ui.js";

initializeNavigation();

const message = document.getElementById("admin-message");
const reportRows = document.getElementById("admin-report-rows");
const statusFilter = document.getElementById("admin-status-filter");
const roleManagement = document.getElementById("role-management");
const profileRows = document.getElementById("profile-rows");
const roleMessage = document.getElementById("role-message");
const adminContent = document.getElementById("admin-content");
const statuses = ["Verifikasi", "Belum Ditangani", "Dalam Proses Perbaikan", "Selesai"];
let currentProfile = null;
let reports = [];

function setMessage(element, text, type = "") {
  element.textContent = text;
  element.dataset.type = type;
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

function renderReports() {
  const selectedStatus = statusFilter.value;
  const visible = selectedStatus ? reports.filter((report) => report.status === selectedStatus) : reports;
  if (!visible.length) {
    reportRows.innerHTML = '<tr><td colspan="4"><div class="empty-state">Tidak ada laporan untuk filter ini.</div></td></tr>';
    return;
  }

  const parentOptions = reports.map((report) =>
    `<option value="${escapeHtml(report.id)}">${escapeHtml(report.id)} · ${escapeHtml(report.address || report.description || "Laporan")}</option>`
  ).join("");

  reportRows.innerHTML = visible.map((report) => `
    <tr data-row-id="${escapeHtml(report.id)}">
      <td>
        <strong>${escapeHtml(report.address || `Laporan ${report.id}`)}</strong>
        <p>${escapeHtml(report.description || "Tidak ada deskripsi")}</p>
        <p><span class="status-pill">Level ${escapeHtml(report.damage_level || "belum terukur")}</span></p>
        ${report.photo_url ? `<a class="text-link" href="${escapeHtml(report.photo_url)}" target="_blank" rel="noopener noreferrer">Lihat foto</a>` : ""}
      </td>
      <td><span class="status-pill" data-status="${escapeHtml(report.status)}">${escapeHtml(report.status)}</span>
        ${report.status_reason ? `<p>${escapeHtml(report.status_reason)}</p>` : ""}
        ${report.merged_into ? `<p>Digabung ke ID ${escapeHtml(report.merged_into)}</p>` : ""}
      </td>
      <td>
        <select data-status-select aria-label="Status baru untuk laporan ${escapeHtml(report.id)}">
          ${statuses.map((status) => `<option ${status === report.status ? "selected" : ""}>${status}</option>`).join("")}
        </select>
        <div class="table-actions" style="margin-top:7px"><button class="button-outline" type="button" data-action="status">Simpan status</button><button class="button-outline" type="button" data-action="reason">Catat tidak wajar</button></div>
      </td>
      <td>
        <select data-merge-parent aria-label="Laporan induk untuk laporan ${escapeHtml(report.id)}">
          <option value="">Pilih ID laporan induk</option>
          ${parentOptions}
        </select>
        <button class="button-outline" type="button" data-action="merge" style="margin-top:7px">Tandai duplikat</button>
        ${report.status === "Selesai" ? `
          <div class="field" style="margin-top:9px"><label for="after-${escapeHtml(report.id)}">Foto setelah perbaikan</label>
            <input id="after-${escapeHtml(report.id)}" data-after-photo type="file" accept="image/jpeg,image/png">
            ${report.after_photo_url ? `<a class="text-link" href="${escapeHtml(report.after_photo_url)}" target="_blank" rel="noopener noreferrer">Lihat foto tersimpan</a>` : ""}
          </div>` : ""}
      </td>
    </tr>
  `).join("");
}

async function loadReports() {
  reportRows.innerHTML = '<tr><td colspan="4" class="loading">Memuat laporan…</td></tr>';
  try {
    reports = await fetchReports();
    renderReports();
    setMessage(message, `${reports.length} laporan dimuat.`, "success");
  } catch (error) {
    setMessage(message, `Laporan gagal dimuat: ${error.message}. Periksa policy SELECT/RLS.`, "error");
    reportRows.innerHTML = "";
    console.error("Admin gagal memuat laporan:", error);
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
  const row = button.closest("tr[data-row-id]");
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
  const row = input.closest("tr[data-row-id]");
  try {
    await saveAfterPhoto(row, input);
    await loadReports();
  } catch (error) {
    setMessage(message, `Foto perbaikan gagal disimpan: ${error.message}`, "error");
    console.error("Unggah foto setelah perbaikan gagal:", error);
  }
});

statusFilter.addEventListener("change", renderReports);
document.getElementById("refresh-admin").addEventListener("click", loadReports);

async function loadProfiles() {
  if (currentProfile.role !== "super_admin") return;
  roleManagement.hidden = false;
  try {
    const profiles = await fetchProfiles();
    profileRows.innerHTML = profiles.map((profile) => `
      <tr data-profile-id="${escapeHtml(profile.id)}">
        <td>${escapeHtml(profile.nama || "Tanpa nama")}<br><small>${escapeHtml(profile.id)}</small></td>
        <td><span class="role-badge">${escapeHtml(profile.role)}</span></td>
        <td>
          <select data-role-select aria-label="Role baru untuk ${escapeHtml(profile.nama || profile.id)}">
            <option value="masyarakat" ${profile.role === "masyarakat" ? "selected" : ""}>Masyarakat</option>
            <option value="petugas" ${profile.role === "petugas" ? "selected" : ""}>Petugas</option>
          </select>
          <button class="button-outline" type="button" data-save-role>Simpan role</button>
        </td>
      </tr>
    `).join("");
  } catch (error) {
    setMessage(roleMessage, `Daftar profil gagal dimuat: ${error.message}. Periksa policy RLS Super Admin.`, "error");
    console.error("Super Admin gagal memuat profiles:", error);
  }
}

profileRows.addEventListener("click", async (event) => {
  const button = event.target.closest("[data-save-role]");
  if (!button) return;
  const row = button.closest("tr[data-profile-id]");
  const newRole = row.querySelector("[data-role-select]").value;
  const profileId = row.dataset.profileId;
  if (!window.confirm(`Ubah role akun ${profileId} menjadi ${newRole}?`)) return;
  try {
    await updateProfileRole(profileId, newRole);
    setMessage(roleMessage, `Role akun ${profileId} diperbarui menjadi ${newRole}.`, "success");
    await loadProfiles();
  } catch (error) {
    setMessage(roleMessage, `Database menolak perubahan role: ${error.message}`, "error");
    console.error("Perubahan role gagal:", error);
  }
});

async function initializeAdmin() {
  try {
    const result = await requireRole(["petugas", "super_admin"]);
    if (!result) return;
    currentProfile = result.profile;
    adminContent.hidden = false;
    const navAdmin = document.querySelector(".nav-admin");
    const logoutButton = document.getElementById("logout-button");
    if (navAdmin) navAdmin.hidden = false;
    if (logoutButton) logoutButton.hidden = false;
    setMessage(message, `Masuk sebagai ${currentProfile.role}.`, "success");
    await Promise.all([loadReports(), loadProfiles()]);
  } catch (error) {
    setMessage(message, `Akses admin gagal: ${error.message}`, "error");
    console.error("Pemeriksaan akses admin gagal:", error);
  }
}

initializeAdmin();
