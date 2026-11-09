import { getCurrentProfile, signOut } from "./auth.js";
import { supabaseClient } from "./supabase-client.js";

let initialized = false;
const modalCloseTimers = new WeakMap();
const modalOpenFrames = new WeakMap();

export function showModal(modal) {
  const closeTimer = modalCloseTimers.get(modal);
  if (closeTimer) {
    window.clearTimeout(closeTimer);
    modalCloseTimers.delete(modal);
  }
  const openFrame = modalOpenFrames.get(modal);
  if (openFrame) window.cancelAnimationFrame(openFrame);

  modal.hidden = false;
  modalOpenFrames.set(modal, window.requestAnimationFrame(() => {
    modalOpenFrames.delete(modal);
    if (!modal.hidden) modal.classList.add("is-visible");
  }));
}

export function hideModal(modal) {
  const openFrame = modalOpenFrames.get(modal);
  if (openFrame) {
    window.cancelAnimationFrame(openFrame);
    modalOpenFrames.delete(modal);
  }
  modal.classList.remove("is-visible");

  const closeTimer = modalCloseTimers.get(modal);
  if (closeTimer) window.clearTimeout(closeTimer);
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    modal.hidden = true;
    modalCloseTimers.delete(modal);
    return;
  }

  modalCloseTimers.set(modal, window.setTimeout(() => {
    if (!modal.classList.contains("is-visible")) modal.hidden = true;
    modalCloseTimers.delete(modal);
  }, 240));
}

function showReportModal() {
  const modal = document.getElementById("report-modal");
  if (!modal) return false;
  document.body.classList.remove("is-menu-visible");
  document.getElementById("sidebar")?.classList.remove("is-open");
  document.querySelector(".mobile-menu")?.setAttribute("aria-expanded", "false");
  modal.style.zIndex = "10001";
  showModal(modal);
  document.body.classList.add("modal-open");
  modal.querySelector(".modal-close")?.focus();
  window.dispatchEvent(new CustomEvent("report-modal-open"));
  return true;
}

function hideReportModal() {
  const modal = document.getElementById("report-modal");
  if (!modal) return;
  hideModal(modal);
  document.body.classList.remove("modal-open");
}

export function initializeNavigation() {
  if (initialized) return;
  initialized = true;

  document.addEventListener("click", (event) => {
    const target = event.target;
    const trigger = target instanceof Element ? target.closest("[data-open-form]") : null;
    if (!trigger) return;
    if (showReportModal()) {
      event.preventDefault();
      event.stopPropagation();
    } else if (trigger instanceof HTMLButtonElement) {
      window.location.assign("./lapor.html");
    }
  }, true);

  document.querySelector(".modal-close")?.addEventListener("click", hideReportModal);
  document.querySelector(".modal-cancel")?.addEventListener("click", hideReportModal);
  document.getElementById("report-modal")?.addEventListener("click", (event) => {
    if (event.target === event.currentTarget) hideReportModal();
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && document.getElementById("report-modal")?.hidden === false) {
      hideReportModal();
    }
  });

  const mobileMenu = document.querySelector(".mobile-menu");
  const sidebar = document.getElementById("sidebar");
  mobileMenu?.addEventListener("click", () => {
    const expanded = mobileMenu.getAttribute("aria-expanded") === "true";
    mobileMenu.setAttribute("aria-expanded", String(!expanded));
    sidebar?.classList.toggle("is-open", !expanded);
  });

  if (new URLSearchParams(window.location.search).get("openReport") === "1") {
    showReportModal();
  }

  const logoutButton = document.getElementById("logout-button");
  const adminLink = document.querySelector("[data-admin-link]");
  const superAdminLink = document.querySelector("[data-super-admin-link]");
  const accountLinks = document.querySelectorAll("[data-account-link]");
  const legacyAdminLink = document.querySelector(".nav-admin");
  const authStatus = document.getElementById("auth-status");
  if (!supabaseClient) return;

  getCurrentProfile()
    .then(({ user, profile }) => {
      if (!user || user.is_anonymous || !profile) return;
      if (logoutButton) {
        logoutButton.hidden = false;
      }

      const isStaff = ["petugas", "super_admin"].includes(profile.role);
      if (legacyAdminLink) legacyAdminLink.hidden = !isStaff;
      if (adminLink) adminLink.hidden = !isStaff;
      if (superAdminLink) superAdminLink.hidden = profile.role !== "super_admin";
      if (isStaff) accountLinks.forEach((link) => { link.hidden = true; });
    })
    .catch((error) => {
      supabaseClient.auth.getSession()
        .then(({ data, error: sessionError }) => {
          if (sessionError) throw sessionError;
          const user = data.session?.user;
          if (user && !user.is_anonymous && logoutButton) logoutButton.hidden = false;
        })
        .catch((sessionError) => {
          console.error("Sesi keluar tidak dapat diperiksa:", sessionError);
        });
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
