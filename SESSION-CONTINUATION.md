# Prompt Melanjutkan LAPOR PAK

Gunakan file ini sebagai konteks awal di sesi Copilot baru. Buka workspace repository `g-runners/LAPOR-PAK`, lalu tempel seluruh prompt di bawah ini ke chat baru.

---

Kamu melanjutkan pengembangan repository LAPOR PAK yang sudah ada di workspace. Baca file ini terlebih dahulu, lalu periksa `git status --short` dan file terkait sebelum mengubah apa pun. Worktree mungkin berisi banyak perubahan lokal yang belum di-commit dari sesi sebelumnya. Jangan reset, checkout, menghapus, atau menimpa perubahan yang bukan bagian langsung dari permintaan baru. Jangan menganggap perubahan yang sudah ada sebagai pekerjaan yang harus diulang.

## Konteks aplikasi

- LAPOR PAK adalah aplikasi pelaporan dan pemantauan jalan rusak. Frontend utamanya berupa HTML/CSS/JavaScript dan menggunakan Supabase.
- Role aplikasi: `masyarakat`, `petugas`, `super_admin`.
- `petugas.html` adalah dashboard laporan untuk Petugas dan juga dapat diakses Super Admin.
- `super-admin.html` memuat pengelolaan akun dan hanya untuk Super Admin.
- Laporan warga memakai halaman umum dan modal laporan bersama.
- Jangan mengubah skema database Supabase, RLS, atau trigger kecuali diminta secara eksplisit.
- Jangan menaruh `service_role` key pada frontend atau repository.
- Jangan mengubah isi folder arsip dan prototipe yang tidak terkait.
- Jangan menyebut nama sistem/proyek lain pada antarmuka atau branding LAPOR PAK; gunakan istilah netral yang menggambarkan fungsi. Penyebutan nama seperti MORIS atau SILAPORFASUM diperbolehkan di dokumentasi apabila memang diperlukan sebagai referensi yang akurat dan membantu pembaca/AI memahami asal-usul, inspirasi, atau keterkaitan fitur. Jangan mengubah folder arsip/prototipe yang dikecualikan saat membersihkan teks antarmuka.
- Pertahankan perubahan lokal yang sudah ada; lakukan perubahan presisi sesuai permintaan baru dan validasi dengan tes yang relevan.

## Implementasi yang sudah ada

- Teks dinamis "Akun baru mendapat role masyarakat secara otomatis." dan "Masuk untuk membuka fitur sesuai tingkat akses Anda." telah dihapus dari alur login.
- Pemisahan Petugas/Super Admin telah dibuat:
  - `petugas.html` dan `js/admin.js`: laporan, verifikasi, status, dan dimensi jalan.
  - `super-admin.html` dan `js/super-admin.js`: pembuatan akun Petugas dan pengelolaan role.
  - `supabase/functions/create-staff/index.ts`: Edge Function pembuatan akun dengan kata sandi sementara.
  - Navigasi dan guard role menggunakan `js/auth.js`, `js/login.js`, `js/ui.js`, dan `js/home.js`.
- Edge Function harus dideploy sebagai `create-staff` dan secret `SUPABASE_SERVICE_ROLE_KEY` harus diatur di Supabase. Fungsi belum dideploy atau dites terhadap trigger/RLS project sebenarnya. Verifikasi pada project Supabase diperlukan sebelum fitur tersebut digunakan.
- Halaman peta menggunakan `peta.html`, `assets/css/peta.css`, `assets/css/site.css`, dan `js/map.js`.
- Perubahan terbaru: sidebar peta pada viewport <= 820 px tertutup secara default agar tidak menutupi peta. Tombol "Tampilkan panel" membuka sidebar; tombol "Tutup panel" menutupnya. Pada desktop sidebar tetap terbuka. Sidebar tertutup juga diberi `inert` dan `aria-hidden`.
- Aksen seluruh halaman utama memakai tema `#f3EEE3` (latar), `#111111` (teks), dan `#D9541E` (aksen). Token CSS menggunakan nama `--accent` dan `--accent-hover`, bukan `--green`; tombol aksen memakai teks gelap agar kontras jelas. Aturan terpusat di `assets/css/theme.css` dan dimuat oleh `index.html`, `login.html`, `petugas.html`, `super-admin.html`, serta `peta.html`.
- Penamaan internal aplikasi telah dinetralkan: stylesheet header bersama berada di `assets/css/site.css` dengan class `.site-header`/`.site-brand`; model deteksi memakai `model/road-damage-detector.onnx`; SQL prioritas jalan memakai `sql/add_road_priority.sql`. Label UI dan dokumentasi tidak memakai nama proyek lain.

## Validasi yang sudah dilakukan

- Terakhir, peta diuji di browser pada viewport 390×844: sidebar tertutup default, tombol buka/tutup bekerja, dan atribut aksesibilitas berubah sesuai keadaan.
- Pada 1280×800 sidebar tetap terbuka dan tombol mobile tidak tampil.
- `node --check js/map.js` dan `git diff --check` lulus untuk perubahan peta.
- Untuk implementasi pemisahan role sebelumnya, 13 tes `python -m unittest discover -s tests -v`, pemeriksaan sintaks JavaScript, pemeriksaan ID HTML unik, dan `git diff --check` lulus.
- Deno tidak tersedia pada sesi sebelumnya sehingga Edge Function belum di-type-check menggunakan Deno.

## Cara melanjutkan

Tangani permintaan terbaru yang saya berikan setelah prompt ini. Sebelum mengedit, periksa keadaan repository saat ini dan baca file terkait. Jangan mengulang pekerjaan yang sudah selesai, jangan membuang perubahan lokal, dan laporkan dengan jelas validasi yang dijalankan serta hal yang belum dapat diverifikasi.
