import { REPORT_PHOTO_BUCKET } from "./supabase-config.js";
import { requireSupabaseClient } from "./supabase-client.js";

const REPORT_TABLE = "reports";
const PROFILE_TABLE = "profiles";
const RATING_TABLE = "report_ratings";

export async function fetchReports() {
  const client = requireSupabaseClient();
  const { data, error } = await client
    .from(REPORT_TABLE)
    .select("*")
    .order("created_at", { ascending: false });

  if (error) throw error;
  return data || [];
}

export async function fetchReport(reportId) {
  const client = requireSupabaseClient();
  const { data, error } = await client
    .from(REPORT_TABLE)
    .select("*")
    .eq("id", reportId)
    .maybeSingle();

  if (error) throw error;
  return data;
}

export async function insertReport(report) {
  const client = requireSupabaseClient();
  const { error } = await client.from(REPORT_TABLE).insert(report);
  if (error) throw error;
}

export async function updateReport(reportId, changes) {
  const client = requireSupabaseClient();
  const { data, error } = await client
    .from(REPORT_TABLE)
    .update(changes)
    .eq("id", reportId)
    .select("id");

  if (error) throw error;
  if (!data?.length) throw new Error("Tidak ada laporan yang diperbarui. Periksa izin RLS atau ID laporan.");
}

export async function fetchProfiles() {
  const client = requireSupabaseClient();
  const { data, error } = await client
    .from(PROFILE_TABLE)
    .select("id,nama,role,created_at")
    .order("created_at", { ascending: false });

  if (error) throw error;
  return data || [];
}

export async function fetchProfile(userId) {
  const client = requireSupabaseClient();
  const { data, error } = await client
    .from(PROFILE_TABLE)
    .select("id,nama,role,created_at")
    .eq("id", userId)
    .maybeSingle();

  if (error) throw error;
  return data;
}

export async function updateProfileRole(userId, role) {
  const client = requireSupabaseClient();
  const { data, error } = await client
    .from(PROFILE_TABLE)
    .update({ role })
    .eq("id", userId)
    .select("id,role");

  if (error) throw error;
  if (!data?.length) throw new Error("Perubahan role tidak tersimpan. Periksa izin RLS dan profil pengguna.");
}

export async function submitRating(reportId, userId, score) {
  const client = requireSupabaseClient();
  const { error } = await client.from(RATING_TABLE).insert({
    report_id: reportId,
    user_id: userId,
    score
  });

  if (error) throw error;
}

function createUploadId() {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();

  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export async function uploadPhoto(file, folder = "reports") {
  const client = requireSupabaseClient();
  const extension = file.type === "image/png" ? "png" : "jpg";
  const path = `${folder}/${createUploadId()}.${extension}`;
  const { error } = await client.storage
    .from(REPORT_PHOTO_BUCKET)
    .upload(path, file, {
      contentType: file.type,
      upsert: false
    });

  if (error) throw error;
  const { data } = client.storage.from(REPORT_PHOTO_BUCKET).getPublicUrl(path);
  if (!data?.publicUrl) {
    await removePhoto(path);
    throw new Error("Supabase tidak memberikan URL foto publik.");
  }
  return { path, publicUrl: data.publicUrl };
}

export async function removePhoto(path) {
  const client = requireSupabaseClient();
  const { error } = await client.storage.from(REPORT_PHOTO_BUCKET).remove([path]);
  if (error) throw error;
}
