# Architecture

Frontend React/Vite/TypeScript/Tailwind-compatible CSS di-host terpisah. Backend Apps Script menerima JSON melalui `doPost`, menyimpan Sheets dan Drive privat, memakai LockService, server timestamp Asia/Jakarta, role check, audit log, dan idempotency key.

`Session.getActiveUser()` hanya dapat dijadikan identitas kuat pada deployment Google Workspace yang sesuai. Gmail pribadi berbeda-beda tidak aman untuk diasumsikan teridentifikasi pada semua mode Apps Script.
