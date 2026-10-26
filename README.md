# Training Load

Pencatat beban latihan dan kesiapan lari untuk pengguna Garmin yang jamnya tidak punya Training Load / Training Readiness (misalnya Forerunner 55).

## Fitur
- **Skor kesiapan 0–100** dari check-in pagi: HRV (RMSSD) dan detak istirahat dibanding angka normalmu sendiri, tidur, Body Battery, pegal, mood, dan rasio beban. Ada saran: siap latihan berat, lari santai, ringan, atau istirahat.
- **Beban latihan (TRIMP Banister)** dari durasi dan HR rata-rata; tanpa HR, diperkirakan dari RPE.
- **Beban 7 hari, rata-rata mingguan 4 minggu, dan rasio akut:kronis**, dengan deteksi jeda data supaya libur panjang tidak terbaca sebagai lonjakan.
- **Impor**: CSV aktivitas Garmin Connect, file .FIT per aktivitas, dan JSON jurnal HRV. Impor ulang tidak membuat data dobel.
- Akun per orang. Data tiap orang hanya bisa dibaca pemiliknya.

## Pemasangan
1. **Database**: Supabase → SQL Editor → New query → tempel isi `schema.sql` → Run. Memakai project yang sama dengan Dompetku; tabelnya berawalan `sl_`.
2. **Alamat web**: Supabase → Authentication → URL Configuration → **Redirect URLs** → tambahkan `https://ariblackheart-cyber.github.io/training-load/`.
3. **GitHub Pages**: Settings → Pages → Deploy from a branch → `main` / root.

Login memakai akun yang sama dengan Dompetku.

## Keamanan
- Row Level Security di setiap tabel: `user_id = auth.uid()`.
- `config.js` hanya berisi publishable key. Jangan pernah menaruh secret key di repo ini.
- Semua file (CSV, FIT, JSON) dibaca di browser; yang dikirim ke database hanya angka ringkasannya.

## Catatan
Skor dan saran adalah panduan latihan, bukan saran medis.
