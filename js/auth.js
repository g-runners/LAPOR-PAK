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
    throw new Error(
      "Profil akun belum tersedia. Jika akun dibuat sebelum trigger aktif, jalankan sql/repair_missing_profiles.sql di Supabase SQL Editor. Jika masih gagal, periksa policy SELECT pada profiles."
    );
  }
  return { user, profile };
}

export async function signIn(email, password) {
  const client = requireSupabaseClient();
  const { data, error } = await client.auth.signInWithPassword({
    email,
    password
  });

  if (error) throw error;
  return data;
}

export async function signUp(email, password) {
  const client = requireSupabaseClient();
  const { data, error } = await client.auth.signUp({
    email,
    password
  });

  if (error) throw error;
  return data;
}

export async function signInAnonymously() {
  const client = requireSupabaseClient();
  const { data, error } = await client.auth.signInAnonymously();

  if (error) throw error;
  if (!data.user) throw new Error("Supabase tidak mengembalikan sesi pengguna anonim.");
  return data.user;
}

export async function ensureAnonymousSession() {
  const client = requireSupabaseClient();
  const { data, error } = await client.auth.getSession();
  if (error) throw error;

  const currentUser = data.session?.user;
  if (currentUser && !currentUser.is_anonymous) return currentUser;
  if (currentUser) {
    const { error: signOutError } = await client.auth.signOut();
    if (signOutError) throw signOutError;
  }
  return signInAnonymously();
}

export async function signOut() {
  const client = requireSupabaseClient();
  const { error } = await client.auth.signOut();
  if (error) throw error;
}

export async function requireRole(allowedRoles, loginNext = "petugas.html") {
  const result = await getCurrentProfile();
  if (!result.user) {
    window.location.replace(`./login.html?next=${encodeURIComponent(loginNext)}`);
    return null;
  }
  if (!result.profile || !allowedRoles.includes(result.profile.role)) {
    window.location.replace("./index.html?access=denied");
    return null;
  }
  return result;
}
