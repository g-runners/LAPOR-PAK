import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json; charset=utf-8"
};

function respond(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), { status, headers: corsHeaders });
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (request.method !== "POST") {
    return respond(405, { error: "Metode permintaan tidak didukung." });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    console.error("Konfigurasi Supabase Edge Function belum lengkap.");
    return respond(500, { error: "Konfigurasi fungsi pembuatan akun belum lengkap." });
  }

  const authorization = request.headers.get("Authorization");
  if (!authorization?.startsWith("Bearer ")) {
    return respond(401, { error: "Sesi Super Admin diperlukan." });
  }

  const userClient = createClient(supabaseUrl, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { Authorization: authorization } }
  });
  const { data: userResult, error: userError } = await userClient.auth.getUser();
  if (userError || !userResult.user) {
    return respond(401, { error: userError?.message || "Sesi pengguna tidak valid." });
  }

  const { data: callerProfile, error: profileError } = await userClient
    .from("profiles")
    .select("role")
    .eq("id", userResult.user.id)
    .maybeSingle();
  if (profileError) {
    console.error("Role pemanggil Edge Function tidak dapat diperiksa:", profileError.message);
    return respond(403, { error: `Role Super Admin tidak dapat diverifikasi: ${profileError.message}` });
  }
  if (callerProfile?.role !== "super_admin") {
    return respond(403, { error: "Akses ditolak. Hanya Super Admin yang dapat membuat akun Petugas." });
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return respond(400, { error: "Isi permintaan harus berupa JSON yang valid." });
  }
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return respond(400, { error: "Data akun tidak valid." });
  }

  const values = payload as Record<string, unknown>;
  const name = typeof values.name === "string" ? values.name.trim() : "";
  const email = typeof values.email === "string" ? values.email.trim().toLowerCase() : "";
  const password = typeof values.password === "string" ? values.password : "";
  if (!name || name.length > 100) {
    return respond(400, { error: "Nama wajib diisi dan maksimal 100 karakter." });
  }
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return respond(400, { error: "Alamat email tidak valid." });
  }
  if (password.length < 8 || password.length > 128) {
    return respond(400, { error: "Kata sandi sementara harus terdiri dari 8 sampai 128 karakter." });
  }

  const adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false }
  });
  const { data: created, error: createError } = await adminClient.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { nama: name }
  });
  if (createError) {
    return respond(400, { error: `Akun Petugas gagal dibuat: ${createError.message}` });
  }
  if (!created.user) {
    return respond(500, { error: "Supabase tidak mengembalikan akun yang dibuat." });
  }

  const { data: updatedProfiles, error: roleUpdateError } = await userClient
    .from("profiles")
    .update({ role: "petugas" })
    .eq("id", created.user.id)
    .select("id");
  if (roleUpdateError || !updatedProfiles?.length) {
    const reason = roleUpdateError?.message || "Profil tidak ditemukan atau perubahan ditolak RLS.";
    const { error: cleanupError } = await adminClient.auth.admin.deleteUser(created.user.id);
    if (cleanupError) {
      console.error("Pembersihan akun Petugas yang gagal promosi role juga gagal:", cleanupError.message);
    }
    const cleanupMessage = cleanupError
      ? " Akun Auth sementara juga gagal dihapus; periksa pengguna tersebut di Supabase Auth."
      : " Akun yang belum mendapat role Petugas sudah dibersihkan.";
    return respond(403, { error: `Role Petugas ditolak oleh policy atau trigger database: ${reason}.${cleanupMessage}` });
  }

  return respond(201, {
    user: {
      id: created.user.id,
      email: created.user.email,
      role: "petugas"
    }
  });
});
