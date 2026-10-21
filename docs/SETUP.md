# Setup

1. Buat project Apps Script.
2. Salin Code.gs dan manifest.
3. Jalankan `setupProject()` dan berikan otorisasi Drive/Sheets.
4. Deploy Web App sebagai user yang mengakses, akses domain Workspace.
5. Panggil bootstrap satu kali dengan email pemilik terverifikasi.
6. Tambahkan user lain ke sheet Users dengan role yang sesuai.

Frontend membutuhkan URL Web App pada service API saat integrasi produksi.
