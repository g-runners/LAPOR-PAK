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

export async function signIn(email, password) {
  const client = requireSupabaseClient();
  const { data, error } = await client.auth.signInWithPassword({
    email,
    password
  });

  if (error) throw error;
  return data;
}

export async function signUp(email, password, nama) {
  const client = requireSupabaseClient();
  const { data, error } = await client.auth.signUp({
    email,
    password,
    options: {
      data: { nama }
    }
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

export async function requireRole(allowedRoles) {
  const result = await getCurrentProfile();
  if (!result.user || !result.profile || !allowedRoles.includes(result.profile.role)) {
    window.location.replace("./login.html?next=admin.html");
    return null;
  }
  return result;
}
