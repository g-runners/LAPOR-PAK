import { requireRole } from "./auth.js";
import { fetchProfiles, updateProfileRole } from "./storage.js";
import { supabaseClient } from "./supabase-client.js";
import { initializeNavigation } from "./ui.js";

initializeNavigation();

const content = document.getElementById("super-admin-content");
const message = document.getElementById("super-admin-message");
const profilesMessage = document.getElementById("profiles-message");
const profileRows = document.getElementById("profile-rows");
const staffForm = document.getElementById("staff-create-form");
const staffSubmit = staffForm.querySelector('button[type="submit"]');

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

async function getFunctionErrorMessage(error) {
  if (error.context instanceof Response) {
    const body = await error.context.text();
    if (body) {
      try {
        const payload = JSON.parse(body);
        if (typeof payload.error === "string") return payload.error;
      } catch {
        return body;
      }
    }
  }
  return error.message;
}

async function loadProfiles() {
  setMessage(profilesMessage, "Memuat akun…");
  try {
    const profiles = await fetchProfiles();
    profileRows.innerHTML = profiles.map((profile) => `
      <article class="operator-report" data-profile-id="${escapeHtml(profile.id)}">
        <div class="operator-report-summary">
          <div>
            <h3>${escapeHtml(profile.nama || "Pengguna")}</h3>
            <p>${escapeHtml(profile.id)}</p>
            <p>Role saat ini: ${escapeHtml(profile.role)}</p>
          </div>
        </div>
        <div class="operator-form">
          <label class="map-field">Tingkat akses baru
            <select data-role-select>
              <option value="super_admin" ${profile.role === "super_admin" ? "selected" : ""} disabled ${profile.role === "super_admin" ? "" : "hidden"}>Super Admin</option>
              <option value="masyarakat" ${profile.role === "masyarakat" ? "selected" : ""}>Masyarakat</option>
              <option value="petugas" ${profile.role === "petugas" ? "selected" : ""}>Petugas</option>
            </select>
          </label>
          <div class="operator-form-actions">
            <button class="operator-primary" type="button" data-save-role>Simpan akses</button>
          </div>
        </div>
      </article>
    `).join("") || '<div class="map-empty">Profil pengguna belum tersedia.</div>';
    setMessage(profilesMessage, "");
  } catch (error) {
    setMessage(profilesMessage, `Profil gagal dimuat: ${error.message}`, "error");
    profileRows.replaceChildren();
    console.error("Super Admin gagal memuat profil:", error);
  }
}

staffForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  setMessage(message, "");
  staffSubmit.disabled = true;
  try {
    if (!supabaseClient) throw new Error("Supabase belum siap. Periksa konfigurasi dan koneksi.");
    const formData = new FormData(staffForm);
    const { data, error } = await supabaseClient.functions.invoke("create-staff", {
      body: {
        name: String(formData.get("name") || "").trim(),
        email: String(formData.get("email") || "").trim(),
        password: String(formData.get("password") || "")
      }
    });
    if (error) throw new Error(await getFunctionErrorMessage(error));
    if (typeof data?.user?.id !== "string") {
      throw new Error("Fungsi pembuatan akun mengembalikan respons yang tidak valid.");
    }
    staffForm.reset();
    setMessage(message, "Akun Petugas berhasil dibuat. Bagikan kata sandi sementara melalui saluran yang aman.", "success");
    await loadProfiles();
  } catch (error) {
    setMessage(message, `Akun Petugas gagal dibuat: ${error.message}`, "error");
    console.error("Pembuatan akun Petugas gagal:", error);
  } finally {
    staffSubmit.disabled = false;
  }
});

profileRows.addEventListener("click", async (event) => {
  const button = event.target.closest("[data-save-role]");
  if (!button) return;
  const row = button.closest("[data-profile-id]");
  const newRole = row.querySelector("[data-role-select]").value;
  button.disabled = true;
  try {
    if (!window.confirm(`Ubah role pengguna menjadi ${newRole}?`)) return;
    await updateProfileRole(row.dataset.profileId, newRole);
    setMessage(profilesMessage, "Tingkat akses berhasil diperbarui.", "success");
    await loadProfiles();
  } catch (error) {
    setMessage(profilesMessage, `Tingkat akses gagal diperbarui: ${error.message}`, "error");
    console.error("Perubahan tingkat akses gagal:", error);
  } finally {
    button.disabled = false;
  }
});

document.getElementById("refresh-profiles").addEventListener("click", loadProfiles);

try {
  const result = await requireRole(["super_admin"], "super-admin.html");
  if (result) {
    content.hidden = false;
    await loadProfiles();
  }
} catch (error) {
  setMessage(message, `Akses Super Admin gagal: ${error.message}`, "error");
  content.hidden = false;
  console.error("Pemeriksaan akses Super Admin gagal:", error);
}
