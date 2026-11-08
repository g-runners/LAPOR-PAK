import { SUPABASE_ANON_KEY, SUPABASE_URL } from "./supabase-config.js";

const isConfigured = Boolean(SUPABASE_URL.trim() && SUPABASE_ANON_KEY.trim());

export const supabaseClient =
  isConfigured && window.supabase?.createClient
    ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
    : null;

export function requireSupabaseClient() {
  if (!SUPABASE_URL.trim() || !SUPABASE_ANON_KEY.trim()) {
    throw new Error("Isi SUPABASE_URL dan SUPABASE_ANON_KEY di js/supabase-config.js.");
  }
  if (!window.supabase?.createClient || !supabaseClient) {
    throw new Error("Library Supabase belum termuat. Periksa koneksi CDN.");
  }
  return supabaseClient;
}
