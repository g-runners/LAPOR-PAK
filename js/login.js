import { getCurrentProfile, signIn, signUp } from "./auth.js";
import { initializeNavigation } from "./ui.js";

initializeNavigation();

const form = document.getElementById("auth-form");
const emailInput = document.getElementById("email");
const passwordInput = document.getElementById("password");
const title = document.getElementById("auth-title");
const submitButton = document.getElementById("submit-auth");
const toggleButton = document.getElementById("toggle-auth-mode");
const message = document.getElementById("auth-message");
let creatingAccount = false;

function showMessage(text, type = "") {
  message.textContent = text;
  message.hidden = !text;
  message.classList.toggle("error", type === "error");
  message.classList.toggle("success", type === "success");
}

function renderMode() {
  title.textContent = creatingAccount ? "Buat akun masyarakat" : "Masuk";
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
      const result = await signUp(email, password);
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
    if (requestedPage === "super-admin.html" && profile.role !== "super_admin") {
      window.location.assign("./index.html?access=denied");
    } else if (requestedPage === "super-admin.html" && profile.role === "super_admin") {
      window.location.assign("./super-admin.html");
    } else if (requestedPage === "petugas.html" && ["petugas", "super_admin"].includes(profile.role)) {
      window.location.assign("./petugas.html");
    } else if (!requestedPage && profile.role === "super_admin") {
      window.location.assign("./super-admin.html");
    } else if (!requestedPage && profile.role === "petugas") {
      window.location.assign("./petugas.html");
    } else if (["petugas.html", "super-admin.html"].includes(requestedPage)) {
      window.location.assign("./index.html?access=denied");
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
