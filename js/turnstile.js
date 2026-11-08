import { TURNSTILE_SITE_KEY } from "./supabase-config.js";

function waitForTurnstile(timeoutMs = 10000) {
  if (window.turnstile) return Promise.resolve(window.turnstile);

  return new Promise((resolve, reject) => {
    const startedAt = Date.now();
    const timer = window.setInterval(() => {
      if (window.turnstile) {
        window.clearInterval(timer);
        resolve(window.turnstile);
      } else if (Date.now() - startedAt >= timeoutMs) {
        window.clearInterval(timer);
        reject(new Error("Skrip Turnstile belum termuat. Periksa koneksi internet."));
      }
    }, 100);
  });
}

export async function mountTurnstile(container, onToken) {
  if (!container) throw new Error("Elemen verifikasi Turnstile tidak ditemukan.");
  if (!TURNSTILE_SITE_KEY.trim()) {
    throw new Error("Isi TURNSTILE_SITE_KEY di js/supabase-config.js.");
  }

  const turnstile = await waitForTurnstile();
  const widgetId = turnstile.render(container, {
    sitekey: TURNSTILE_SITE_KEY,
    callback: onToken,
    "expired-callback": () => onToken(""),
    "error-callback": () => onToken("")
  });

  return {
    reset() {
      turnstile.reset(widgetId);
      onToken("");
    },
    remove() {
      turnstile.remove(widgetId);
    }
  };
}
