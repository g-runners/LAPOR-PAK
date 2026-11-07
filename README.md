# LAPOR PAK

Aplikasi Flask untuk pelaporan warga dan pemantauan jalan rusak, dengan dashboard operator dan peta interaktif. Data laporan dan akun operator disimpan di `data/lapor_pak.json`; gambar disimpan di folder `uploads/`.

## Fitur

- Warga membuat laporan dengan foto pilihan atau jepretan langsung dari kamera (maksimal 5 MB), koordinat melalui peta atau GPS, dan deskripsi kerusakan. Akses kamera memerlukan localhost atau HTTPS.
- Status laporan, foto bukti perbaikan, dan pengelolaan laporan hanya dapat diubah operator yang login.
- Warga melihat daftar dan detail laporan pada peta, mencari lokasi, memfilter status, melihat prioritas kerusakan, menggunakan lokasi saat ini, serta meminta rute ke lokasi.
- Warga dapat memberi penilaian setelah laporan berstatus selesai.
- Tidak ada fitur deteksi kamera otomatis.

## Menjalankan aplikasi


Pasang Python 3.10+.



Buat virtual environment dan pasang dependensi:

```powershell
py -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
```



Salin `.env.example` menjadi `.env` dan ganti `SECRET_KEY` dengan nilai acak yang tetap.



Buat akun operator awal:

```powershell
python init_db.py
```

Skrip meminta username dan password operator secara interaktif; tidak ada kredensial bawaan. Berkas JSON dibuat otomatis saat operator atau laporan pertama disimpan.



Jalankan aplikasi:

```powershell
python app.py
```

Buka `http://127.0.0.1:5000`. Login operator tersedia di `http://127.0.0.1:5000/operator/login`. Di VS Code, pilih konfigurasi **LAPOR PAK (app.py)** pada panel **Run and Debug** agar aplikasi dan semua asetnya dilayani Flask; jangan gunakan Live Server untuk aplikasi ini.


GPS browser membutuhkan localhost atau HTTPS. Peta, tile OpenStreetMap, dan pembuatan rute memerlukan koneksi internet. JSON cocok untuk penggunaan lokal/single-server dengan volume data terbatas; hindari menjalankan beberapa worker/server yang menulis bersamaan. Untuk penggunaan publik berskala besar, gunakan database server. Cadangkan `data/lapor_pak.json` dan folder `uploads/` bersama-sama. Untuk penggunaan publik, jalankan di belakang HTTPS dan server WSGI, set `FLASK_DEBUG=0`, gunakan secret key acak yang tetap, serta batasi akses.
