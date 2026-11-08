import { TURNSTILE_SITE_KEY } from "./supabase-config.js";
import { requireSupabaseClient } from "./supabase-client.js";
import { fetchProfile } from "./storage.js";

export async function getCurrentProfile() {
  const client = requireSupabaseClient();
  const { data, error } = await client.auth.getSession();
  if (error) throw error;

  const user = data.session?.user || null;
  if (!user) return { user: null, profile: null };

  const profile = await fetchProfile(user.id);
  if (!profile) {
    throw new Error("Profil akun belum tersedia. Pastikan trigger profiles berjalan.");
  }
  return { user, profile };
}

export async function signIn(email, password, captchaToken) {
  const client = requireSupabaseClient();
  const options = captchaToken ? { options: { captchaToken } } : {};
  const { data, error } = await client.auth.signInWithPassword({
    email,
    password,
    ...options
  });

  if (error) throw error;
  return data;
}

export async function signUp(email, password, nama, captchaToken) {
  const client = requireSupabaseClient();
  const { data, error } = await client.auth.signUp({
    email,
    password,
    options: {
      data: { nama },
      captchaToken
    }
  });

  if (error) throw error;
  return data;
}

export async function signInAnonymously(captchaToken) {
  if (!TURNSTILE_SITE_KEY.trim()) {
    throw new Error("Isi TURNSTILE_SITE_KEY di js/supabase-config.js.");
  }
  if (!captchaToken) throw new Error("Selesaikan verifikasi Turnstile terlebih dahulu.");

  const client = requireSupabaseClient();
  const { data, error } = await client.auth.signInAnonymously({
    options: { captchaToken }
  });

  if (error) throw error;
  if (!data.user) throw new Error("Supabase tidak mengembalikan sesi pengguna anonim.");
  return data.user;
}

export async function ensureAnonymousSession(captchaToken) {
  const client = requireSupabaseClient();
  const { data, error } = await client.auth.getSession();
  if (error) throw error;

  const currentUser = data.session?.user;
  if (currentUser && !currentUser.is_anonymous) return currentUser;
  if (currentUser) {
    const { error: signOutError } = await client.auth.signOut();
    if (signOutError) throw signOutError;
  }
  return signInAnonymously(captchaToken);
}

export async function signOut() {
  const client = requireSupabaseClient();
  const { error } = await client.auth.signOut();
  if (error) throw error;
}

export async function requireRole(allowedRoles) {
  const result = await getCurrentProfile();
  if (!result.user || !result.profile || !allowedRoles.includes(result.profile.role)) {
    window.location.replace("./login.html?next=admin.html");
    return null;
  }
  return result;
}
