# THR Management
# https://oqi-aja.github.io/thrbase/

Aplikasi sederhana untuk mencatat penyerahan THR berupa barang. Frontend memakai HTML, CSS, dan JavaScript murni. Backend memakai Google Apps Script, Google Sheets, dan Google Drive.

## Struktur

```text
index.html       # halaman dan markup aplikasi
style.css        # seluruh tampilan responsive
app.js           # navigasi, foto, validasi, dan API client
Code.gs          # backend Apps Script, Sheets, Drive, role, audit
appsscript.json  # manifest Apps Script
README.md        # dokumentasi project
.gitignore       # pengecualian file lokal/rahasia
```

## Menjalankan frontend

Gunakan static server sederhana atau buka `index.html` langsung di browser. Untuk server lokal tanpa dependency:

```powershell
python -m http.server 8080
```

Buka `http://localhost:8080`. Jika `API_URL` pada awal `app.js` kosong, aplikasi berjalan dalam mode demo dan tidak menyimpan data ke Google.

## Menyiapkan backend

1. Buat project Apps Script.
2. Salin `Code.gs` dan `appsscript.json` ke project tersebut.
3. Jalankan `setupProject()` satu kali sebagai pemilik dan berikan izin Sheets/Drive.
4. Jalankan `previewUsersMigration()` untuk memeriksa header dan baris Users tanpa mengubah data.
5. Rapikan sheet `Users` secara manual menjadi delapan kolom sebelum bootstrap.
6. Jalankan `bootstrapAppUser("admin", "Nama Admin")` satu kali dari editor Apps Script sebagai pemilik.
7. Salin URL `/exec` deployment ke konstanta `API_URL` di `app.js`.

Login memakai username-only dan tidak memakai akun Google atau password. Model ini tidak membuktikan identitas pemegang username; siapa pun yang mengetahui username dapat menyamar sebagai akun tersebut. Gunakan deployment dan akses spreadsheet sesuai kebijakan organisasi.

## Login aplikasi dan manajemen pengguna

1. Sheet `Users` harus memiliki: `user_id`, `username`, `display_name`, `role`, `active`, `created_at`, `updated_at`, `created_by`.
2. Bootstrap hanya dilakukan melalui fungsi editor Apps Script dan tidak tersedia sebagai action API publik.
3. `SUPER_ADMIN` dapat membuka dashboard, transaksi, Audit Log, dan manajemen pengguna. Pengaturan saat ini hanya halaman informasi; belum ada endpoint untuk mengubah konfigurasi.
4. `ADMIN` menjalankan operasional THR dan transaksi, tetapi tidak dapat mengelola pengguna.
5. Pengguna baru dari dashboard selalu berrole `ADMIN`; endpoint pengelolaan pengguna tetap dibatasi untuk `SUPER_ADMIN`.
6. Token sesi disimpan di backend selama enam jam dan diverifikasi pada setiap endpoint privat.
7. Nonaktifkan akun dari dashboard untuk menolak login dan sesi lama.

Akun lama dengan header tergabung tidak dimigrasikan otomatis. Tinjau hasil `previewUsersMigration()` dan perbaiki sheet secara manual agar data lama tidak tertukar.

## Keamanan dan data

Role diverifikasi backend, bukan dari browser atau `localStorage`. Foto divalidasi server, disimpan di folder Drive privat, dan transaksi memakai timestamp server Asia/Jakarta, `LockService`, UUID, audit log, serta idempotency key. Tidak ada pembayaran atau nominal uang dalam aplikasi.

## Pengujian

- `node --check app.js`
- `git diff --check`
- Jalankan melalui HTTPS untuk menguji GPS. Lokasi wajib valid sebelum transaksi dikirim; penolakan izin, timeout, dan lokasi tidak tersedia menampilkan pesan serta opsi mencoba kembali.
- Uji navigasi, upload JPG/PNG/WebP, penolakan file >5 MB, preview, validasi form, dan mode demo.
- Setelah backend tersedia, uji role `ADMIN` dan `SUPER_ADMIN`, sinkronisasi dashboard, Audit Log, manajemen pengguna, transaksi ganda/idempotensi, upload gagal, dan akses tanpa izin.

Integrasi Google, Sheets, Drive, dan deployment tidak diklaim berhasil sebelum diuji pada project Apps Script pemilik. Test lokal tidak menulis spreadsheet produksi.

## Format Google Sheets

Formatting dijalankan manual oleh pemilik spreadsheet dari editor Apps Script. Fungsi ini hanya membuka spreadsheet dengan ID `SPREADSHEET_ID` pada Script Properties; fungsi tidak mengubah sharing atau permission spreadsheet maupun folder Drive.

1. Buka project Apps Script yang berwenang atas spreadsheet.
2. Pastikan `Code.gs` sudah tersalin.
3. Jalankan `setupProject()` satu kali jika `SPREADSHEET_ID` belum tersedia, lalu setujui izin Google Sheets dan Google Drive.
4. Jalankan `formatSpreadsheet()` dari editor Apps Script sebagai pemilik atau editor yang berwenang.
5. Setujui izin tambahan jika diminta.
6. Buka spreadsheet dan verifikasi header, filter, warna baris, freeze row, timestamp, wrap text, status, dan lebar kolom.

`formatSpreadsheet()` aman dijalankan berulang kali: filter dan banding lama diganti, conditional formatting status yang dikelola formatter diganti, dan data tidak dihapus. Jika spreadsheet atau folder memiliki akses terbatas, biarkan tetap terbatas; jangan gunakan `Anyone with the link -> Editor`.
