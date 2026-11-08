import { getCurrentProfile, signIn, signUp } from "./auth.js";
import { initializeNavigation } from "./ui.js";

initializeNavigation();

const form = document.getElementById("auth-form");
const nameField = document.getElementById("name-field");
const nameInput = document.getElementById("nama");
const emailInput = document.getElementById("email");
const passwordInput = document.getElementById("password");
const title = document.getElementById("auth-title");
const description = document.getElementById("auth-description");
const submitButton = document.getElementById("submit-auth");
const toggleButton = document.getElementById("toggle-auth-mode");
const message = document.getElementById("auth-message");
let creatingAccount = false;

function showMessage(text, type = "") {
  message.textContent = text;
  message.dataset.type = type;
}

function renderMode() {
  nameField.hidden = !creatingAccount;
  nameInput.required = creatingAccount;
  title.textContent = creatingAccount ? "Buat akun masyarakat" : "Masuk";
  description.textContent = creatingAccount
    ? "Akun baru mendapat role masyarakat secara otomatis."
    : "Masuk untuk membuka fitur sesuai tingkat akses Anda.";
  submitButton.textContent = creatingAccount ? "Daftar" : "Masuk";
  toggleButton.textContent = creatingAccount ? "Saya sudah punya akun" : "Buat akun masyarakat";
  passwordInput.autocomplete = creatingAccount ? "new-password" : "current-password";
}

toggleButton.addEventListener("click", () => {
  creatingAccount = !creatingAccount;
  showMessage("");
  renderMode();
});

renderMode();

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  showMessage("");
  submitButton.disabled = true;
  try {
    const email = emailInput.value.trim();
    const password = passwordInput.value;
    if (!email || !password) throw new Error("Email dan kata sandi wajib diisi.");
    if (creatingAccount) {
      const nama = nameInput.value.trim();
      if (!nama) throw new Error("Nama wajib diisi.");
      const result = await signUp(email, password, nama);
      if (!result.session) {
        showMessage("Pendaftaran diterima. Periksa email untuk konfirmasi, lalu masuk.", "success");
        form.reset();
        return;
      }
    } else {
      await signIn(email, password);
    }

    const { user, profile } = await getCurrentProfile();
    if (!user || !profile) throw new Error("Sesi akun tidak ditemukan setelah autentikasi.");
    const requestedPage = new URLSearchParams(window.location.search).get("next");
    if (["petugas", "super_admin"].includes(profile.role) &&
        (requestedPage === "admin.html" || !requestedPage)) {
      window.location.assign("./admin.html");
    } else {
      window.location.assign("./peta.html");
    }
  } catch (error) {
    showMessage(`Autentikasi gagal: ${error.message}`, "error");
    console.error("Autentikasi gagal:", error);
  } finally {
    submitButton.disabled = false;
  }
});
