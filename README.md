# THR Management

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
4. Deploy sebagai Web App dengan akses terbatas Google Workspace dan identitas pengguna yang dapat diverifikasi.
5. Bootstrap Super Admin satu kali melalui fungsi `bootstrap_(email, displayName)` dari editor Apps Script.
6. Tambahkan user lain pada sheet `Users` dengan role `SUPER_ADMIN`, `ADMIN`, `OPERATOR`, atau `VIEWER`.
7. Salin URL `/exec` deployment ke konstanta `API_URL` di `app.js`.

Jangan deploy anonim. `Session.getActiveUser()` tidak selalu mengembalikan email untuk Gmail pribadi; gunakan konfigurasi Google Workspace yang mendukung identitas pengguna.

## Keamanan dan data

Role diverifikasi backend, bukan dari browser atau `localStorage`. Foto divalidasi server, disimpan di folder Drive privat, dan transaksi memakai timestamp server Asia/Jakarta, `LockService`, UUID, audit log, serta idempotency key. Tidak ada pembayaran atau nominal uang dalam aplikasi.

## Pengujian

- `node --check app.js`
- `git diff --check`
- Jalankan static server, uji navigasi, upload JPG/PNG/WebP, penolakan file >5 MB, preview, kembali antar langkah, validasi form, retry, dan mode demo.
- Setelah backend tersedia, uji akun setiap role, transaksi ganda, upload gagal, akses tanpa izin, dan audit log.

Integrasi Google dan deployment tidak diklaim berhasil sebelum diuji pada project Apps Script pemilik.

## Format Google Sheets

Formatting dijalankan manual oleh pemilik spreadsheet dari editor Apps Script. Fungsi ini hanya membuka spreadsheet dengan ID `SPREADSHEET_ID` pada Script Properties; fungsi tidak mengubah sharing atau permission spreadsheet maupun folder Drive.

1. Buka project Apps Script yang berwenang atas spreadsheet.
2. Pastikan `Code.gs` sudah tersalin.
3. Jalankan `setupProject()` satu kali jika `SPREADSHEET_ID` belum tersedia, lalu setujui izin Google Sheets dan Google Drive.
4. Jalankan `formatSpreadsheet()` dari editor Apps Script sebagai pemilik atau editor yang berwenang.
5. Setujui izin tambahan jika diminta.
6. Buka spreadsheet dan verifikasi header, filter, warna baris, freeze row, timestamp, wrap text, status, dan lebar kolom.

`formatSpreadsheet()` aman dijalankan berulang kali: filter dan banding lama diganti, conditional formatting status yang dikelola formatter diganti, dan data tidak dihapus. Jika spreadsheet atau folder memiliki akses terbatas, biarkan tetap terbatas; jangan gunakan `Anyone with the link -> Editor`.