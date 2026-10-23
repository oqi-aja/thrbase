const SPREADSHEET_ID = "1WVAZ9Y8BGbXF2bKn7id7qld7NOzkx6odZQi9ZXWx0Xw";
const EVIDENCE_FOLDER_ID = "1OiLIke9VSSzbhqsd3SB-M6ffGTbSXUJQ";
const APP = {
  TZ: "Asia/Jakarta",
  SESSION_TTL: 6 * 60 * 60 * 1000,
  LOGIN_WINDOW: 15 * 60 * 1000,
  LOGIN_LIMIT: 8,
  MAX_BYTES: 5 * 1024 * 1024,
  MIME: ["image/jpeg", "image/png", "image/webp"],
  SHEETS: {
    Users: [
      "user_id",
      "username",
      "display_name",
      "role",
      "active",
      "created_at",
      "updated_at",
      "created_by",
    ],
    Recipients: ["recipient_id", "name", "identifier", "created_at", "active"],
    Transactions: [
      "transaction_id",
      "recipient_id",
      "recipient_name_snapshot",
      "item_name",
      "officer_id",
      "officer_name_snapshot",
      "timestamp_server",
      "drive_file_id",
      "notes",
      "status",
      "created_at",
      "updated_at",
      "idempotency_key",
      "latitude",
      "longitude",
      "maps_url",
    ],
    AuditLogs: [
      "log_id",
      "actor_id",
      "action",
      "entity_type",
      "entity_id",
      "timestamp_server",
      "details",
    ],
    Settings: ["key", "value"],
  },
};
function doGet() {
  return json_({ ok: true, service: "THR Management API" });
}
function doPost(e) {
  try {
    const body = JSON.parse(e.postData.contents || "{}");
    return json_(route_(body));
  } catch (x) {
    return json_({ ok: false, code: x.code || "API_ERROR", error: x.message || String(x) });
  }
}
function json_(x) {
  return ContentService.createTextOutput(JSON.stringify(x)).setMimeType(
    ContentService.MimeType.JSON,
  );
}
function publicUser_(u) {
  return { user_id: u.user_id, username: u.username, display_name: u.display_name, role: u.role, active: u.active };
}
function normalizeHeader_(v) {
  return String(v || "").trim().toLowerCase();
}
function username_(v) {
  return String(v || "").trim().toLowerCase();
}
function bool_(v) {
  return v === true || ["true", "1", "yes", "ya", "aktif"].includes(String(v).trim().toLowerCase());
}
function role_(v) {
  const value = String(v || "").trim().toUpperCase();
  return ["SUPER_ADMIN", "ADMIN"].includes(value) ? value : "";
}
function userRows_() {
  return rows_("Users").map((u) => ({ ...u, username: username_(u.username), active: bool_(u.active), role: role_(u.role) }));
}
function apiError_(code, message) {
  const error = Error(message);
  error.code = code;
  return error;
}
function session_(token) {
  if (!token) throw apiError_("SESSION_REQUIRED", "Sesi login diperlukan.");
  const raw = PropertiesService.getScriptProperties().getProperty("SESSION_" + token);
  if (!raw) throw apiError_("SESSION_INVALID", "Sesi tidak valid atau sudah kedaluwarsa.");
  const data = JSON.parse(raw);
  if (Date.now() > data.expires) {
    PropertiesService.getScriptProperties().deleteProperty("SESSION_" + token);
    throw apiError_("SESSION_EXPIRED", "Sesi sudah kedaluwarsa.");
  }
  const u = userRows_().find((x) => x.user_id === data.user_id && x.active === true);
  if (!u) throw apiError_("SESSION_INVALID", "Akun tidak aktif.");
  return u;
}
function requireSession_(body, roles) {
  const u = session_(body.session_token);
  if (roles && roles.indexOf(u.role) < 0) throw apiError_("FORBIDDEN", "Akses ditolak.");
  return u;
}
function analyzeUsersMigration_(values) {
  const headers = (values[0] || []).map(normalizeHeader_);
  const normalized = headers;
  const index = Object.fromEntries(headers.map((h, i) => [h, i]));
  const target = APP.SHEETS.Users;
  const mergedHeaders = headers.filter((h) => /\s+/.test(h) && !target.includes(h));
  const usernameSources = ["username", "user_name", "login", "email", "password", "password_hash", "password_salt"]
    .filter((h) => normalized.includes(h));
  const conflicts = [];
  const duplicateHeaders = headers.filter((h, i) => h && headers.indexOf(h) !== i);
  if (duplicateHeaders.length) conflicts.push({ type: "duplicate_header", headers: [...new Set(duplicateHeaders)] });
  if (mergedHeaders.length) conflicts.push({ type: "merged_header", headers: mergedHeaders });
  if (usernameSources.includes("email") && !usernameSources.includes("username")) conflicts.push({ type: "email_not_username" });
  if (usernameSources.some((h) => ["password", "password_hash", "password_salt"].includes(h))) conflicts.push({ type: "password_not_username" });
  const rows = (values || []).slice(1).map((row, n) => {
    const get = (h) => index[h] === undefined ? "" : row[index[h]];
    const username = String(get("username") || "").trim().toLowerCase();
    const role = role_(get("role"));
    const rawActive = get("active");
    const activeKnown = rawActive === true || rawActive === false || ["true", "false", "1", "0", "yes", "no", "ya", "tidak", "aktif", "nonaktif"].includes(String(rawActive).trim().toLowerCase());
    const rowConflicts = [];
    if (!username) rowConflicts.push("username_missing_or_ambiguous");
    if (index.role !== undefined && !role) rowConflicts.push("role_not_allowed");
    if (index.active !== undefined && !activeKnown) rowConflicts.push("active_unknown");
    if (rowConflicts.length) conflicts.push({ type: "row", row: n + 2, issues: rowConflicts });
    return { row: n + 2, username, role, active: activeKnown ? bool_(rawActive) : null };
  });
  const seen = {};
  rows.forEach((r) => {
    if (r.username) {
      if (!seen[r.username]) seen[r.username] = [];
      seen[r.username].push(r.row);
    }
  });
  Object.entries(seen).forEach(([username, rowNumbers]) => { if (rowNumbers.length > 1) conflicts.push({ type: "duplicate_username", username, rows: rowNumbers }); });
  return { headers, rows, target, mergedHeaders, usernameSources, conflicts, safe: headers.length === target.length && target.every((h) => index[h] !== undefined) && conflicts.length === 0 };
}
function previewUsersMigration() {
  const values = sheet_("Users").getDataRange().getValues();
  const report = analyzeUsersMigration_(values);
  return { ...report, note: "Preview only; no data changed." };
}
function migrateUsers_() {
  const s = sheet_("Users"), values = s.getDataRange().getValues();
  if (!values.length) { s.getRange(1, 1, 1, APP.SHEETS.Users.length).setValues([APP.SHEETS.Users]); return; }
  const report = analyzeUsersMigration_(values);
  if (!report.safe) throw Error("Users perlu migrasi manual setelah previewUsersMigration(); data tidak diubah otomatis. Konflik: " + report.conflicts.length);
  return { ok: true, headers: report.headers };
}
function bootstrapAppUser(username, displayName) {
  migrateUsers_();
  if (userRows_().some((u) => u.username)) throw Error("Akun aplikasi sudah tersedia.");
  const value = String(username || "").trim().toLowerCase();
  if (!/^[a-z0-9._-]{3,40}$/.test(value)) throw Error("Username tidak valid.");
  const now = now_();
  sheet_("Users").appendRow([uid_(), value, displayName || value, "SUPER_ADMIN", true, now, now, "SCRIPT_OWNER"]);
  return { ok: true };
}
function cleanupExpiredSessions_() {
  try {
    const props = PropertiesService.getScriptProperties();
    const all = props.getProperties();
    const now = Date.now();
    Object.keys(all).forEach((key) => {
      if (key.indexOf("SESSION_") !== 0) return;
      try {
        const data = JSON.parse(all[key]);
        if (!data.expires || now > data.expires) props.deleteProperty(key);
      } catch (e) {
        props.deleteProperty(key);
      }
    });
  } catch (e) {
    // Pembersihan sesi kedaluwarsa bersifat best-effort.
  }
}
function login_(b) {
  const username = username_(b.username);
  if (!username) throw Error("Username wajib diisi.");
  const cache = CacheService.getScriptCache();
  const failKey = "LOGINFAIL_" + username;
  const fails = Number(cache.get(failKey) || 0);
  if (fails >= APP.LOGIN_LIMIT)
    throw apiError_("RATE_LIMITED", "Terlalu banyak percobaan login untuk username ini. Coba lagi dalam " + Math.ceil(APP.LOGIN_WINDOW / 60000) + " menit.");
  const matches = userRows_().filter((x) => username_(x.username) === username);
  if (matches.length > 1) throw Error("Konfigurasi Users ambigu: username duplikat setelah normalisasi.");
  const u = matches[0];
  if (!u) {
    cache.put(failKey, String(fails + 1), Math.floor(APP.LOGIN_WINDOW / 1000));
    throw Error("Username tidak ditemukan.");
  }
  if (u.active !== true) throw Error("Akun tidak aktif.");
  cleanupExpiredSessions_();
  const token = Utilities.getUuid() + Utilities.getUuid().replace(/-/g, ""), expires = Date.now() + APP.SESSION_TTL;
  PropertiesService.getScriptProperties().setProperty("SESSION_" + token, JSON.stringify({ user_id: u.user_id, expires }));
  cache.remove(failKey);
  return { ok: true, session_token: token, expires, user: publicUser_(u) };
}
function users_(b) {
  requireSession_(b, ["SUPER_ADMIN"]);
  return { ok: true, data: userRows_().map(publicUser_) };
}
function saveUser_(b) {
  const actor = requireSession_(b, ["SUPER_ADMIN"]), username = username_(b.username), name = String(b.display_name || "").trim();
  if (!/^[a-z0-9._-]{3,40}$/.test(username) || !name) throw Error("Data pengguna tidak valid.");
  const role = b.user_id ? role_(b.role) : "ADMIN";
  if (!role || (role === "SUPER_ADMIN" && b.user_id !== actor.user_id)) throw Error("Role pengguna tidak diizinkan.");
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const s = sheet_("Users"), values = s.getDataRange().getValues(), headers = headerMap_(values, "Users"), idx = Object.fromEntries(headers.map((h, i) => [h, i]));
    if (userRows_().some((u) => String(u.username || "").toLowerCase() === username && String(u.user_id) !== String(b.user_id || ""))) throw Error("Username sudah digunakan.");
    const now = now_(), row = b.user_id ? values.findIndex((r, i) => i > 0 && String(r[idx.user_id]) === String(b.user_id)) : -1;
    if (row < 1) {
      const record = { user_id: uid_(), username: username, display_name: name, role: role, active: b.active !== false, created_at: now, updated_at: now, created_by: actor.user_id };
      s.appendRow(headers.map((h) => record[h] !== undefined ? record[h] : ""));
      log_(actor, "CREATE", "USER", record.user_id, { username: username, display_name: name, role: role });
    } else {
      const r = row + 1;
      [["username", username], ["display_name", name], ["role", role], ["active", bool_(b.active)], ["updated_at", now]].forEach(([h, v]) => { if (idx[h] !== undefined) s.getRange(r, idx[h] + 1).setValue(v); });
      log_(actor, "UPDATE", "USER", b.user_id, { username: username, display_name: name, role: role });
    }
    return { ok: true };
  } finally {
    lock.releaseLock();
  }
}
function logout_(b) { if (b.session_token) PropertiesService.getScriptProperties().deleteProperty("SESSION_" + b.session_token); return { ok: true }; }
function setupProject() {
  const p = PropertiesService.getScriptProperties();
  const ss = openSpreadsheet_();
  p.setProperty("SPREADSHEET_ID", ss.getId());
  const folder = getEvidenceFolder_(false);
  p.setProperty("FOLDER_ID", folder.getId());
  Object.keys(APP.SHEETS).forEach((n) => {
    let s = ss.getSheetByName(n) || ss.insertSheet(n);
    if (s.getLastRow() === 0) s.appendRow(APP.SHEETS[n]);
  });
  ensureTransactionLocationHeaders_();
  migrateUsers_();
  return { spreadsheetId: ss.getId(), folderId: folder.getId() };
}
function formatSpreadsheet() {
  const spreadsheet = openSpreadsheet_();
  const headerColor = "#145A42";
  const headerTextColor = "#FFFFFF";
  const idColumns = new Set([
    "user_id",
    "recipient_id",
    "transaction_id",
    "officer_id",
    "drive_file_id",
    "idempotency_key",
    "log_id",
    "actor_id",
    "entity_id",
  ]);
  const timestampColumns = new Set([
    "created_at",
    "updated_at",
    "timestamp_server",
  ]);

  Object.entries(APP.SHEETS).forEach(([sheetName, headers]) => {
    const sheet = spreadsheet.getSheetByName(sheetName);
    if (!sheet) {
      return;
    }

    const columnCount = headers.length;
    const rowCount = Math.max(sheet.getLastRow(), 1);
    const headerRange = sheet.getRange(1, 1, 1, columnCount);

    headerRange
      .setBackground(headerColor)
      .setFontColor(headerTextColor)
      .setFontWeight("bold")
      .setHorizontalAlignment("center")
      .setVerticalAlignment("middle");
    sheet.setFrozenRows(1);
    sheet.setRowHeight(1, 36);

    const existingFilter = sheet.getFilter();
    if (existingFilter) {
      existingFilter.remove();
    }
    if (rowCount > 1) {
      sheet.getRange(1, 1, rowCount, columnCount).createFilter();
      sheet
        .getRange(2, 1, rowCount - 1, columnCount)
        .setVerticalAlignment("middle");
    }

    const banding = sheet.getBandings();
    banding.forEach((band) => band.remove());
    sheet
      .getRange(1, 1, rowCount, columnCount)
      .applyRowBanding(SpreadsheetApp.BandingTheme.LIGHT_GREY, true, false);
    headerRange
      .setBackground(headerColor)
      .setFontColor(headerTextColor)
      .setFontWeight("bold");

    headers.forEach((header, index) => {
      const column = index + 1;
      const range = rowCount > 1
        ? sheet.getRange(2, column, rowCount - 1, 1)
        : sheet.getRange(1, column, 1, 1);

      if (timestampColumns.has(header) && rowCount > 1) {
        range.setNumberFormat("yyyy-mm-dd hh:mm:ss");
      }
      if (header === "notes" || header === "details") {
        range.setWrapStrategy(SpreadsheetApp.WrapStrategy.WRAP);
      }
      sheet.autoResizeColumn(column);
      if (idColumns.has(header)) {
        sheet.setColumnWidth(column, 150);
      } else if (sheet.getColumnWidth(column) > 300) {
        sheet.setColumnWidth(column, 300);
      } else if (sheet.getColumnWidth(column) < 100) {
        sheet.setColumnWidth(column, 100);
      }
    });
  });

  const transactions = spreadsheet.getSheetByName("Transactions");
  if (transactions && transactions.getLastRow() > 1) {
    const headers = APP.SHEETS.Transactions;
    const statusColumn = headers.indexOf("status") + 1;
    const statusRange = transactions.getRange(
      2,
      statusColumn,
      transactions.getLastRow() - 1,
      1,
    );
    const rules = transactions
      .getConditionalFormatRules()
      .filter((rule) => !rule.getRanges().some((range) =>
        range.getSheet().getSheetId() === transactions.getSheetId() &&
        range.getColumn() === statusColumn,
      ));
    rules.push(
      SpreadsheetApp.newConditionalFormatRule()
        .whenTextEqualTo("ACTIVE")
        .setBackground("#D9EAD3")
        .setFontColor("#274E13")
        .setRanges([statusRange])
        .build(),
      SpreadsheetApp.newConditionalFormatRule()
        .whenTextEqualTo("DELETED")
        .setBackground("#F4CCCC")
        .setFontColor("#990000")
        .setRanges([statusRange])
        .build(),
    );
    transactions.setConditionalFormatRules(rules);
  }

  return {
    ok: true,
    spreadsheetId,
    sheets: Object.keys(APP.SHEETS),
  };
}
function now_() {
  return Utilities.formatDate(new Date(), APP.TZ, "yyyy-MM-dd'T'HH:mm:ssXXX");
}
function uid_() {
  return Utilities.getUuid();
}
function openSpreadsheet_() {
  const id = String(
    PropertiesService.getScriptProperties().getProperty("SPREADSHEET_ID") || SPREADSHEET_ID || "",
  ).trim();
  if (!id) throw Error("SPREADSHEET_ID belum dikonfigurasi. Jalankan setupProject() atau simpan ID spreadsheet di Script Properties.");
  try {
    return SpreadsheetApp.openById(id);
  } catch (e) {
    throw Error("SPREADSHEET_ID tidak valid atau spreadsheet tidak dapat diakses oleh akun pelaksana Apps Script.");
  }
}
function getEvidenceFolder_(allowCreate) {
  const id = EVIDENCE_FOLDER_ID;
  if (!id) throw Error("EVIDENCE_FOLDER_ID belum dikonfigurasi di Code.gs.");
  if (/^https?:\/\//i.test(id) || /[\s/]/.test(id)) {
    throw Error("EVIDENCE_FOLDER_ID harus berisi ID folder Google Drive saja, bukan URL.");
  }
  try {
    const folder = DriveApp.getFolderById(id);
    if (folder.getId() !== id) throw Error("ID folder Drive tidak sesuai konfigurasi.");
    return folder;
  } catch (e) {
    throw Error("Folder bukti THR tidak valid atau tidak dapat diakses. Pastikan akun pelaksana Apps Script memiliki akses ke folder " + id + ". Detail: " + (e.message || e));
  }
}
function sheet_(n) {
  const spreadsheet = openSpreadsheet_();
  const sheet = spreadsheet.getSheetByName(n);
  if (!sheet) throw Error("Sheet " + n + " tidak ditemukan pada spreadsheet yang dikonfigurasi.");
  return sheet;
}
function ensureTransactionLocationHeaders_() {
  const sheet = sheet_("Transactions");
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(APP.SHEETS.Transactions);
    return;
  }
  const headers = headerMap_(sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues(), "Transactions");
  const missing = ["latitude", "longitude", "maps_url"].filter((h) => !headers.includes(h));
  if (missing.length) sheet.getRange(1, sheet.getLastColumn() + 1, 1, missing.length).setValues([missing]);
}
function headerMap_(values, sheetName) {
  const rawHeaders = values[0] || [];
  const headers = rawHeaders.map(normalizeHeader_);
  const duplicates = headers.filter((h, i) => h && headers.indexOf(h) !== i);
  if (duplicates.length) throw Error("Konfigurasi sheet " + sheetName + " memiliki header duplikat: " + [...new Set(duplicates)].join(", "));
  return headers;
}
function rows_(n) {
  const values = sheet_(n).getDataRange().getValues();
  if (!values.length) return [];
  const headers = headerMap_(values, n);
  const required = n === "Users" ? APP.SHEETS.Users : [];
  const missing = required.filter((h) => !headers.includes(normalizeHeader_(h)));
  if (missing.length) throw Error("Konfigurasi sheet " + n + " kekurangan header wajib: " + missing.join(", "));
  if (values.length < 2) return [];
  return values.slice(1).map((r) => Object.fromEntries(headers.map((h, i) => [h, r[i]])));
}
function actor_(body) {
  return requireSession_(body);
}
function require_(body, roles) {
  return requireSession_(body, roles);
}
function auditDetails_(d) {
  const value = { ...(d || {}) };
  ["session_token", "password", "password_hash", "password_salt", "photo", "dataUrl"].forEach((key) => delete value[key]);
  return value;
}
function log_(u, a, t, id, d) {
  try {
    let details = "";
    try { details = JSON.stringify(auditDetails_(d)); } catch (e) { details = "{}"; }
    if (details.length > 45000) details = details.slice(0, 45000);
    sheet_("AuditLogs").appendRow([
      uid_(),
      u.user_id,
      a,
      t,
      id,
      now_(),
      details,
    ]);
  } catch (e) {
    // Audit log bersifat best-effort; kegagalan menulis log tidak boleh
    // menggagalkan operasi utama yang sudah berhasil tersimpan.
  }
}
function auditLogs_(b) {
  requireSession_(b, ["ADMIN", "SUPER_ADMIN"]);
  const names = Object.fromEntries(userRows_().map((u) => [u.user_id, u.username]));
  return {
    ok: true,
    data: rows_("AuditLogs")
      .map((x) => ({
        log_id: x.log_id,
        timestamp_server: x.timestamp_server,
        action: x.action,
        entity_type: x.entity_type,
        entity_id: x.entity_id,
        actor_id: x.actor_id,
        actor_username: names[x.actor_id] || "-",
      }))
      .reverse()
      .slice(0, 300),
  };
}
function status_(b) {
  const u = requireSession_(b);
  const props = PropertiesService.getScriptProperties();
  let sessionExpires = null;
  try {
    const raw = props.getProperty("SESSION_" + b.session_token);
    if (raw) sessionExpires = JSON.parse(raw).expires || null;
  } catch (e) {}
  const transactions = rows_("Transactions").filter((x) => String(x.status).toUpperCase() !== "DELETED");
  return {
    ok: true,
    now: now_(),
    spreadsheet_id: props.getProperty("SPREADSHEET_ID") || SPREADSHEET_ID || "",
    session_expires: sessionExpires,
    user: publicUser_(u),
    counts: { users: userRows_().length, transactions: transactions.length },
  };
}
function route_(b) {
  const action = b.action;
  if (action === "login") return login_(b);
  if (action === "logout") return logout_(b);
  if (action === "health") return { ok: true, now: now_() };
  if (action === "status") return status_(b);
  if (action === "audit_logs") return auditLogs_(b);
  if (action === "users") return users_(b);
  if (action === "save_user") return saveUser_(b);
  if (action === "list") {
    requireSession_(b, ["ADMIN", "SUPER_ADMIN"]);
    return {
      ok: true,
      data: rows_("Transactions")
        .filter((x) => x.status !== "DELETED")
        .reverse()
        .slice(0, 500),
    };
  }
  if (action === "create") return create_(b);
  if (action === "delete") return delete_(b);
  if (action === "delete_recipient") return deleteRecipient_(b);
  throw Error("Action tidak dikenal.");
}
function create_(b) {
  const u = require_(b, ["ADMIN", "SUPER_ADMIN"]);
  if (!b.idempotency_key) throw Error("Idempotency key wajib.");
  const latitudeText = String(b.latitude ?? "").trim(),
    longitudeText = String(b.longitude ?? "").trim();
  let latitude = null, longitude = null, mapsUrl = "";
  if (latitudeText || longitudeText) {
    latitude = Number(latitudeText);
    longitude = Number(longitudeText);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude))
      throw Error("Koordinat lokasi tidak valid.");
    if (latitude < -90 || latitude > 90)
      throw Error("Latitude harus berada di antara -90 dan 90.");
    if (longitude < -180 || longitude > 180)
      throw Error("Longitude harus berada di antara -180 dan 180.");
    mapsUrl = "https://www.google.com/maps?q=" + latitude + "," + longitude;
  }
  const old = rows_("Transactions").find(
    (x) => x.idempotency_key === b.idempotency_key,
  );
  if (old) return { ok: true, data: old, duplicate: true };
  if (!b.photo || typeof b.photo.dataUrl !== "string")
    throw Error("Foto wajib.");
  const m = b.photo.dataUrl.match(
    /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/,
  );
  if (!m) throw Error("Format foto tidak valid. Gunakan JPEG, PNG, atau WebP.");
  let bytes;
  try {
    bytes = Utilities.base64Decode(m[2]);
  } catch (e) {
    throw Error("Data Base64 foto tidak valid. Detail: " + (e.message || e));
  }
  if (bytes.length > APP.MAX_BYTES) throw Error("Foto maksimal 5 MB.");
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  let f;
  try {
    const folder = getEvidenceFolder_(false);
    f = folder.createFile(Utilities.newBlob(bytes, m[1], "THR_" + uid_()));
    const driveFileId = f.getId();
    const id = uid_(),
      t = now_();
    const transactionSheet = sheet_("Transactions");
    ensureTransactionLocationHeaders_();
    const transactionHeaders = headerMap_(
      transactionSheet.getRange(1, 1, 1, transactionSheet.getLastColumn()).getValues(),
      "Transactions",
    );
    const transaction = {
      transaction_id: id,
      recipient_id: b.recipient_id || "",
      recipient_name_snapshot: String(b.recipient_name || "").trim(),
      item_name: String(b.item_name || "").trim(),
      officer_id: u.user_id,
      officer_name_snapshot: u.username,
      timestamp_server: t,
      drive_file_id: driveFileId,
      notes: String(b.notes || "").slice(0, 500),
      status: "ACTIVE",
      created_at: t,
      updated_at: t,
      idempotency_key: b.idempotency_key,
      latitude,
      longitude,
      maps_url: mapsUrl,
    };
    transactionSheet.appendRow(transactionHeaders.map((header) => transaction[header] ?? ""));
    log_(u, "CREATE", "TRANSACTION", id, b);
    return {
      ok: true,
      data: {
        transaction_id: id,
        drive_file_id: driveFileId,
        timestamp_server: t,
      },
    };
  } catch (e) {
    if (f)
      try {
        f.setTrashed(true);
      } catch (ignore) {}
    throw e;
  } finally {
    lock.releaseLock();
  }
}
function deleteRecipient_(b) {
  const u = require_(b, ["ADMIN", "SUPER_ADMIN"]);
  if (!b.recipient_id) throw Error("recipient_id wajib diisi.");
  const s = sheet_("Recipients");
  const values = s.getDataRange().getValues();
  if (!values.length) throw Error("Penerima tidak ditemukan.");
  const headers = headerMap_(values, "Recipients");
  const idx = Object.fromEntries(headers.map((h, i) => [h, i]));
  if (idx.recipient_id === undefined || idx.active === undefined)
    throw Error("Konfigurasi sheet Recipients tidak lengkap.");
  let found = null;
  for (let i = 1; i < values.length; i++) {
    if (String(values[i][idx.recipient_id]) !== String(b.recipient_id)) continue;
    found = { row: i + 1, name: values[i][idx.name] || "" };
    if (!bool_(values[i][idx.active])) return { ok: true, already_deleted: true };
    s.getRange(i + 1, idx.active + 1).setValue(false);
    if (idx.updated_at !== undefined) s.getRange(i + 1, idx.updated_at + 1).setValue(now_());
    break;
  }
  if (!found) throw Error("Penerima tidak ditemukan.");
  log_(u, "DELETE", "RECIPIENT", b.recipient_id, { name: found.name });
  return { ok: true };
}
function delete_(b) {
  const u = require_(b, ["ADMIN", "SUPER_ADMIN"]);
  if (!b.transaction_id) throw Error("transaction_id wajib diisi.");
  const s = sheet_("Transactions");
  const r = rows_("Transactions").find(
    (x) => String(x.transaction_id) === String(b.transaction_id),
  );
  if (!r) throw Error("Transaksi tidak ditemukan.");
  if (String(r.status).toUpperCase() === "DELETED") return { ok: true, already_deleted: true };
  const vals = s.getDataRange().getValues();
  const headers = headerMap_(vals, "Transactions");
  const idx = Object.fromEntries(headers.map((h, i) => [h, i]));
  if (idx.transaction_id === undefined || idx.status === undefined)
    throw Error("Konfigurasi sheet Transactions tidak lengkap.");
  for (let i = 1; i < vals.length; i++)
    if (String(vals[i][idx.transaction_id]) === String(b.transaction_id)) {
      s.getRange(i + 1, idx.status + 1).setValue("DELETED");
      if (idx.updated_at !== undefined) s.getRange(i + 1, idx.updated_at + 1).setValue(now_());
      break;
    }
  log_(u, "DELETE", "TRANSACTION", b.transaction_id, { recipient_name_snapshot: r.recipient_name_snapshot });
  return { ok: true };
}
