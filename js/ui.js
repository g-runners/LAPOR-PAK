import { getCurrentProfile, signOut } from "./auth.js";
import { supabaseClient } from "./supabase-client.js";

export function initializeNavigation() {
  const toggle = document.querySelector(".menu-toggle");
  const nav = document.getElementById("site-nav");

  toggle?.addEventListener("click", () => {
    const expanded = toggle.getAttribute("aria-expanded") === "true";
    toggle.setAttribute("aria-expanded", String(!expanded));
    nav?.classList.toggle("open", !expanded);
  });

  const logoutButton = document.getElementById("logout-button");
  const adminLink = document.querySelector(".nav-admin");
  if (!logoutButton && !adminLink) return;
  if (!supabaseClient) return;

  const authStatus = document.getElementById("auth-status");
  getCurrentProfile()
    .then(({ user, profile }) => {
      if (!user || !profile) return;
      if (logoutButton) logoutButton.hidden = false;
      if (adminLink && ["petugas", "super_admin"].includes(profile.role)) {
        adminLink.hidden = false;
      }
    })
    .catch((error) => {
      if (authStatus) {
        authStatus.textContent = `Sesi tidak dapat diperiksa: ${error.message}`;
        authStatus.hidden = false;
      }
      console.error("Pemeriksaan sesi gagal:", error);
    });

  logoutButton?.addEventListener("click", async () => {
    try {
      await signOut();
      window.location.assign("./index.html");
    } catch (error) {
      if (authStatus) {
        authStatus.textContent = `Gagal keluar: ${error.message}`;
        authStatus.hidden = false;
      }
      console.error("Logout gagal:", error);
    }
  });
}
