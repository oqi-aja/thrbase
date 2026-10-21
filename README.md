# THR Management

Aplikasi dokumentasi penyerahan THR berupa barang. Frontend React/Vite terpisah dari Google Apps Script JSON API.

## Lokal

```powershell
cd frontend
npm install
npm run build
```

Frontend saat ini menyediakan alur foto → data → konfirmasi → riwayat lokal. Hubungkan endpoint Apps Script sebelum produksi; jangan menganggap data lokal sebagai database.

## Backend

Buat project Apps Script, salin `apps-script/Code.gs` dan `appsscript.json`, jalankan `setupProject()` sekali sebagai pemilik, lalu deploy Web App dengan identitas Google Workspace yang dapat diverifikasi. Bootstrap Super Admin memakai endpoint `bootstrap` satu kali menggunakan email pemilik yang terverifikasi.

Jangan deploy anonim. Beri akses domain/akun yang diperlukan dan daftarkan pengguna pada sheet Users.
