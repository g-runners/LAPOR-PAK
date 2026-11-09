# Traceability LAPOR PAK

Pemetaan implementasi mengacu pada proposal `laporpak-1-13.pdf` bagian 6 dan skema target Supabase yang disetujui. Hak akses selalu ditegakkan oleh RLS; pemeriksaan role pada halaman hanya mengatur tampilan dan navigasi.

| Kode | Kebutuhan / use case | Implementasi |
|---|---|---|
| F-01 | Unggah bukti foto JPG/PNG | `lapor.html`, `js/reports.js`, `js/storage.js` |
| F-02 | Deskripsi singkat | `lapor.html`, `js/reports.js` |
| F-03 | GPS, titik peta, atau alamat manual | `lapor.html`, `js/reports.js` |
| F-04 | Laporan dengan/tanpa login | `js/auth.js`, `js/reports.js` |
| F-05 | Simpan foto, deskripsi, lokasi, waktu, status awal Verifikasi | `js/reports.js`, `js/storage.js` |
| F-06 | Peta titik laporan | `peta.html`, `js/map.js` |
| F-07 | Foto, deskripsi, lokasi, status pada detail | `peta.html`, `js/map.js` |
| F-08 | Empat status proposal | `js/admin.js`, `peta.html` |
| F-09 | Dashboard laporan Petugas, juga dapat diakses Super Admin | `petugas.html`, `js/admin.js`, `js/auth.js` |
| F-10 | Perbarui status laporan | `js/admin.js`, `js/storage.js` |
| F-11 | Prioritas dari level kerusakan dan laporan berdekatan | `js/map.js`; severity utama, jumlah tetangga dalam 2 m sebagai pemecah seri |
| F-12 | Ekspor data dan statistik CSV | `peta.html`, `js/map.js`, `js/export.js` |
| UC-01 | Membuat laporan, validasi, deteksi foto, lokasi, status awal | `lapor.html`, `js/reports.js`, `js/detector.js`, `js/storage.js` |
| UC-02 | Peta, statistik, detail, loading/empty state | `peta.html`, `js/map.js` |
| UC-03 | Validasi laporan, alasan tidak wajar, taut duplikat oleh Petugas dan Super Admin | `petugas.html`, `js/admin.js` |
| UC-04 | Status oleh Petugas dan Super Admin, konfirmasi transisi tidak berurutan, riwayat oleh trigger | `petugas.html`, `js/admin.js`; `report_status_logs` tetap diisi trigger |
| UC-05 | Ekspor CSV | `peta.html`, `js/export.js` |
| UC-06 | Buat akun petugas | `super-admin.html`, `js/super-admin.js`, `supabase/functions/create-staff/index.ts`; Edge Function perlu dideploy ke project Supabase |
| UC-07 | Ubah role masyarakat/petugas untuk Super Admin | `super-admin.html`, `js/super-admin.js`, `js/storage.js`; trigger database tetap memutuskan perubahan role |

## Fitur tambahan dari ringkasan proposal

Foto setelah perbaikan dan rating 1–5 **dikonfirmasi untuk versi ini** walaupun tidak tercantum di daftar F/UC. Foto disimpan pada `reports.after_photo_url` oleh petugas setelah status `Selesai`; warga memberi nilai lewat `report_ratings`. Implementasi berada di `petugas.html`, `js/admin.js`, `peta.html`, `js/map.js`, dan `js/storage.js`.

Tinggi kamera disimpan pada kolom tambahan `reports.camera_height_cm` berdasarkan konfirmasi pengguna. Perhitungan level severity adalah perkiraan dengan asumsi kamera miring 40° ke bawah, FOV vertikal 60°, serta permukaan datar. Hasil tetap perlu validasi; bukan pengganti pemeriksaan lapangan.

Pengelompokan PostGIS/DBSCAN belum dibuat. Perhitungan jarak radius 2 meter hanya dilakukan di sisi klien, sesuai keputusan pengguna.
