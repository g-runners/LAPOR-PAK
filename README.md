# LAPOR PAK — Lapor dan Pantau Jalan Rusak

* [ ] 

## Pengujian lokal (opsional)

Bagian ini hanya untuk mencoba website di komputer sebelum deploy. Karena halaman memakai JavaScript modules, browser perlu membukanya melalui HTTP, bukan `file://`. Perintah ini menjalankan server lokal sementara dan **tidak diperlukan untuk deploy**.

```powershell
py -m http.server 8000
```

Buka `http://localhost:8000`. Untuk geolokasi, gunakan localhost atau domain HTTPS. Jika dibuka dari ponsel memakai alamat IP komputer melalui HTTP, browser akan memblokir GPS karena itu bukan secure origin. Gunakan URL HTTPS (misalnya setelah deploy ke GitHub Pages) untuk menguji GPS dari ponsel; unggah foto dan pengiriman laporan lainnya tetap bisa dicoba dari jaringan lokal. Saat sudah di-deploy ke GitHub Pages, GitHub menyajikan file website melalui HTTPS secara otomatis; tidak perlu menjalankan Python, backend, atau langkah build.

Konfigurasi Supabase

Isi [js/supabase-config.js](./js/supabase-config.js):

```js
export const SUPABASE_URL = "https://PROJECT_ID.supabase.co";
export const SUPABASE_ANON_KEY = "PUBLISHABLE_OR_ANON_KEY";
export const TURNSTILE_SITE_KEY = "";
```

Gunakan hanya publishable/anon key; jangan pernah menaruh `service_role` key atau kata sandi di file frontend.

Aktifkan email/password dan anonymous sign-in pada Supabase Auth. CAPTCHA sementara dinonaktifkan di aplikasi; pastikan CAPTCHA Supabase juga nonaktif agar login, pendaftaran, dan pelaporan anonim dapat berjalan. Pengiriman tanpa akun memakai sesi anonymous Auth agar insert tetap berjalan melalui RLS.

Website mengharapkan tabel dan bucket yang sudah disediakan:

- `profiles(id, nama, role, created_at)`; trigger membuat profil role `masyarakat`.
- `reports`, `report_status_logs`, dan `report_ratings` sesuai skema yang diberikan.
- Bucket publik `report-photos`, JPG/PNG, maksimum 5 MB.
- Fungsi `current_role_name()` dan `is_staff()`.

Pastikan policy RLS mengizinkan pembacaan laporan publik, insert laporan oleh sesi masyarakat/anonymous, unggah foto sesuai role, rating untuk laporan selesai, dan hanya petugas/Super Admin memperbarui laporan. Akses `profiles` dan perubahan role harus dibatasi sesuai role. Frontend hanya menyembunyikan UI; RLS tetap menjadi penegak hak akses.

### Tambahan kalibrasi kamera

Atas persetujuan pengguna, [sql/add_camera_height_cm.sql](./sql/add_camera_height_cm.sql) menambahkan kolom `reports.camera_height_cm`. Jalankan sekali di Supabase SQL Editor sebelum mengirim laporan. Script tidak membuat tabel dan tidak mengubah policy RLS.

Detektor MORIS dijalankan di browser melalui ONNX Runtime Web. Level Ringan/Sedang/Parah adalah **perkiraan**, memakai tinggi kamera yang diisi pelapor, sudut tetap 40° di bawah horizontal, FOV vertikal tetap 60°, dan asumsi permukaan jalan datar. Angka ini bukan pengukuran lapangan; model dilatih untuk mendeteksi pothole dan kalibrasi sumber MORIS belum tervalidasi. Jika tinggi kamera kosong atau geometri tidak dapat dihitung, level disimpan sebagai `null`.

## Deploy tanpa build

### GitHub Pages

1. Pastikan file `index.html` berada di root branch/folder publik repository.
2. Pada **Settings → Pages**, pilih branch dan root folder yang benar.
3. Isi URL Supabase dan anon key.
4. Deploy; tidak ada proses build.

### Netlify

1. Deploy repository/folder ini sebagai static site.
2. Kosongkan **Build command** dan set **Publish directory** ke root (`.`).
3. Isi konfigurasi frontend dan daftar domain HTTPS di Supabase.

## Versi CDN yang dipin

- Supabase JS UMD: `@supabase/supabase-js@2.119.0` (versi `latest` registry diverifikasi saat implementasi).
- Leaflet: `leaflet@1.9.4` (versi stabil/latest pada registry saat implementasi).
- ONNX Runtime Web: `onnxruntime-web@1.31.1` (versi `latest` registry diverifikasi saat implementasi).

## Pemeriksaan alur dan RLS

1. Buka `lapor.html`, isi foto JPG/PNG maksimum 5 MB, deskripsi, lokasi, dan (opsional) tinggi kamera; pastikan preview/deteksi muncul.
2. Kirim tanpa akun; pastikan baris berstatus `Verifikasi` dan foto tersimpan di `report-photos`.
3. Masuk sebagai `masyarakat`, coba memperbarui `reports.status` dari DevTools atau REST API; RLS harus menolak update.
4. Buka `admin.html` sebagai masyarakat; halaman harus ditolak, dan operasi database langsung juga harus ditolak RLS.
5. Masuk sebagai `petugas`; verifikasi laporan, uji alasan tidak wajar, duplikat, dan transisi status. Pastikan trigger membuat `report_status_logs`.
6. Masuk sebagai `super_admin`; ubah role pengguna. Coba turunkan role diri sendiri dan pastikan trigger menolak serta pesan database terlihat.
7. Pada laporan `Selesai`, unggah foto perbaikan dan kirim rating 1–5. Policy harus menolak rating untuk laporan yang belum selesai.
8. Pada `peta.html`, coba filter, ekspor kedua file CSV, laporan kosong, dan jaringan lambat/kegagalan RLS.

Penyimpanan dan policy Supabase tidak dapat diuji end-to-end sebelum URL, key, pengaturan Auth, serta policy project diisi/dikonfirmasi pemilik project.

## TODO / batasan yang diketahui

- Aktifkan kembali proteksi CAPTCHA (Turnstile) dan konfigurasikan di Supabase sebelum publikasi.
- UC-06 pembuatan akun petugas ditunda. Implementasikan kelak lewat Supabase Edge Function atau endpoint tepercaya; jangan gunakan `service_role` key di browser.
- Pengelompokan radius 2 meter dan prioritas severity lalu jumlah laporan berdekatan dihitung di browser. Pengelompokan berbasis PostGIS/DBSCAN masih TODO.
- Prioritas MORIS asli mengurutkan `roads.damage_percentage`; sumber kode tidak menyediakan rumus untuk menghitung persentase itu. LAPOR PAK memakai severity sebagai urutan utama dan jumlah laporan dalam radius sebagai pemecah seri.
- Perkiraan damage level perlu divalidasi terhadap sampel foto dan kalibrasi kamera yang representatif sebelum digunakan untuk keputusan perbaikan.
- Konfigurasi kebijakan RLS/Storage adalah tanggung jawab project Supabase dan tidak dibuat/diubah oleh website ini.
