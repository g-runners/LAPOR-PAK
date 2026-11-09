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

Jika login melaporkan profil akun belum tersedia, jalankan [sql/repair_missing_profiles.sql](./sql/repair_missing_profiles.sql) sekali di Supabase SQL Editor sebagai pemilik project. Script ini membuat profil yang belum ada untuk akun Auth lama, memastikan trigger profil pengguna baru tersedia, dan mempertahankan role pada profil yang sudah ada. Jika error tetap muncul sesudahnya, periksa policy SELECT `profiles` agar pengguna terautentikasi dapat membaca profilnya sendiri.

### Membuat akun Super Admin pertama

1. Buka `login.html`, pilih **Buat akun masyarakat**, lalu daftar dengan email dan kata sandi. Konfirmasi email jika Supabase mewajibkannya.
2. Ganti `GANTI_EMAIL_DAFTAR` pada [sql/promote_initial_super_admin.sql](./sql/promote_initial_super_admin.sql) dengan email akun tersebut, lalu jalankan script di Supabase SQL Editor sebagai pemilik project.
3. Masuk kembali. Akun akan mendapat akses ke `petugas.html` dan `super-admin.html`.

Pembuatan akun publik hanya memberi role `masyarakat`. Script bootstrap melewati trigger penjaga role hanya selama transaksi untuk promosi awal, lalu mengaktifkannya kembali sebelum commit. Simpan akses Super Admin dengan aman; jangan menaruh `service_role` key di browser atau repository. Untuk promosi akun berikutnya, gunakan panel tingkat akses di `super-admin.html`.

`petugas.html` adalah dashboard laporan untuk role **petugas** dan **super_admin**. `super-admin.html` memuat pengelolaan akun dan hanya dapat dibuka oleh **super_admin**. Login/dashboard Flask lama dengan akun `operator` terpisah sudah dihapus; role aplikasi yang digunakan adalah `masyarakat`, `petugas`, dan `super_admin`.

### Membuat akun Petugas

Deploy `supabase/functions/create-staff/index.ts` sebagai Edge Function bernama `create-staff` menggunakan Supabase CLI. Pastikan secret `SUPABASE_SERVICE_ROLE_KEY` tersedia di environment fungsi melalui Supabase Secrets; jangan salin secret itu ke kode frontend. Fungsi memverifikasi sesi dan role Super Admin, membuat akun Auth dengan kata sandi sementara, lalu mengubah profil menjadi `petugas` memakai sesi Super Admin agar policy RLS dan trigger database tetap berlaku. Jika trigger atau policy menolak perubahan, fungsi menghapus akun Auth yang baru dibuat dan menampilkan error. Setelah deployment, gunakan form di `super-admin.html`; kata sandi sementara harus dibagikan lewat saluran aman.

Pastikan policy RLS mengizinkan pembacaan laporan publik, insert laporan oleh sesi masyarakat/anonymous, unggah foto sesuai role, rating untuk laporan selesai, dan hanya petugas/Super Admin memperbarui laporan. Akses `profiles` dan perubahan role harus dibatasi sesuai role. Frontend hanya menyembunyikan UI; RLS tetap menjadi penegak hak akses.

### Tambahan kalibrasi kamera

Atas persetujuan pengguna, [sql/add_camera_height_cm.sql](./sql/add_camera_height_cm.sql) menambahkan kolom `reports.camera_height_cm`. Jalankan sekali di Supabase SQL Editor sebelum mengirim laporan. Script tidak membuat tabel dan tidak mengubah policy RLS.

Deteksi kerusakan foto dijalankan di browser melalui ONNX Runtime Web. Level Ringan/Sedang/Parah adalah **perkiraan**, memakai tinggi kamera yang diisi pelapor, sudut tetap 40° di bawah horizontal, FOV vertikal tetap 60°, dan asumsi permukaan jalan datar. Angka ini bukan pengukuran lapangan; model dilatih untuk mendeteksi lubang dan kalibrasi estimasinya belum tervalidasi. Jika tinggi kamera kosong atau geometri tidak dapat dihitung, level disimpan sebagai `null`.

### Prioritas jalan di peta

Jalankan [sql/add_road_priority.sql](./sql/add_road_priority.sql) di Supabase SQL Editor sebelum memakai fitur prioritas. Script menambahkan tabel jalan, kolom pengukuran laporan, relasi laporan-jalan, dan view `road_priorities`; script ini tidak dijalankan otomatis oleh website dan aman dijalankan ulang untuk menerapkan default dimensi terbaru. Jalan baru memakai default panjang 100 m dan lebar 5 m (disimpan dalam cm), ditandai belum diverifikasi, lalu petugas mengonfirmasi/memperbarui ukuran sebenarnya dari dashboard.

Persentase kerusakan dihitung dari jumlah luas lubang terukur dibagi luas jalan (`panjang × lebar`) dikali 100. Laporan duplikat tidak dihitung dua kali. Skor prioritas 1–10 memakai interval 10%. Persentase tidak dipotong ke 100%, sehingga hasil di atas 100% dapat menandakan perkiraan luas tumpang tindih atau dimensi jalan perlu diperiksa. Nilai awal dimensi setiap jalan adalah default 100 m × 5 m; peta menandainya sampai petugas memverifikasi ukuran sebenarnya dari dashboard. Laporan tanpa ukuran lubang tetap tampil tetapi belum memiliki persentase prioritas.

Reverse geocoding memakai Nominatim dan rute memakai layanan OSRM daring. Keduanya memerlukan koneksi internet; kegagalan geocoding tidak mencegah pengiriman dan alamat dapat dilengkapi manual. Peta dasarnya memakai tile OpenStreetMap. Penggunaan layanan publik dapat memiliki batas laju dan ketersediaan; mengganti layanan geocoding/rute dengan penyedia atau instance terkelola sendiri sebelum trafik produksi adalah TODO. Fitur server yang bergantung pada database lokal tidak dapat dipakai langsung pada GitHub Pages dan telah diganti dengan pembacaan Supabase serta pemrosesan sisi browser.

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

1. Buka beranda, pilih **Buat laporan** (atau kunjungi `lapor.html` sebagai pintasan). Isi foto JPG/PNG maksimum 5 MB, deskripsi, lokasi, dan (opsional) tinggi kamera; pastikan preview/deteksi muncul.
2. Kirim tanpa akun; pastikan baris berstatus `Verifikasi` dan foto tersimpan di `report-photos`.
3. Masuk sebagai `masyarakat`, coba memperbarui `reports.status` dari DevTools atau REST API; RLS harus menolak update.
4. Buka `petugas.html` sebagai masyarakat; halaman harus ditolak, dan operasi database langsung juga harus ditolak RLS.
5. Masuk sebagai `petugas`; verifikasi laporan, uji alasan tidak wajar, duplikat, dan transisi status. Pastikan trigger membuat `report_status_logs`.
6. Masuk sebagai `super_admin`; ubah role pengguna. Coba turunkan role diri sendiri dan pastikan trigger menolak serta pesan database terlihat.
7. Pada laporan `Selesai`, unggah foto perbaikan dan kirim rating 1–5. Policy harus menolak rating untuk laporan yang belum selesai.
8. Jalankan migrasi prioritas jalan, lalu pada `peta.html` uji filter, empat status, grup jalan, skor, pin duplikat, foto/detail, rute, rating, dan ekspor kedua file CSV.

Penyimpanan dan policy Supabase tidak dapat diuji end-to-end sebelum URL, key, pengaturan Auth, serta policy project diisi/dikonfirmasi pemilik project.

## TODO / batasan yang diketahui

- Aktifkan kembali proteksi CAPTCHA (Turnstile) dan konfigurasikan di Supabase sebelum publikasi.
- UC-06 memiliki source Edge Function `supabase/functions/create-staff/index.ts`; fungsi perlu dideploy ke project Supabase sebelum pembuatan akun Petugas dapat digunakan.
- Pengelompokan radius 2 meter, jumlah laporan berdekatan, dan filter peta dihitung di browser. Pengelompokan berbasis PostGIS/DBSCAN masih TODO.
- Skor prioritas area jalan mengikuti rumus LAPOR PAK yang disepakati; persentase/ukuran model masih perlu divalidasi terhadap pengukuran lapangan.
- Routing publik OSRM dan reverse geocoding Nominatim adalah dependensi daring; deploy dengan instance/provider terkelola sendiri jika batas laju atau ketersediaan layanan publik tidak memadai.
- Perkiraan damage level perlu divalidasi terhadap sampel foto dan kalibrasi kamera yang representatif sebelum digunakan untuk keputusan perbaikan.
- Konfigurasi kebijakan RLS/Storage adalah tanggung jawab project Supabase dan tidak dibuat/diubah oleh website ini.
