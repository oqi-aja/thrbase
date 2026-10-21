const SPREADSHEET_ID = "1WVAZ9Y8BGbXF2bKn7id7qld7NOzkx6odZQi9ZXWx0Xw";
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
    return json_({ ok: false, error: x.message || String(x) });
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
function bool_(v) {
  return v === true || ["true", "1", "yes", "ya", "aktif"].includes(String(v).trim().toLowerCase());
}
function role_(v) {
  const value = String(v || "").trim().toUpperCase();
  return ["SUPER_ADMIN", "ADMIN"].includes(value) ? value : "";
}
function userRows_() {
  return rows_("Users").map((u) => ({ ...u, active: bool_(u.active), role: role_(u.role) }));
}
function session_(token) {
  if (!token) throw Error("Sesi login diperlukan.");
  const raw = PropertiesService.getScriptProperties().getProperty("SESSION_" + token);
  if (!raw) throw Error("Sesi tidak valid atau sudah kedaluwarsa.");
  const data = JSON.parse(raw);
  if (Date.now() > data.expires) {
    PropertiesService.getScriptProperties().deleteProperty("SESSION_" + token);
    throw Error("Sesi sudah kedaluwarsa.");
  }
  const u = userRows_().find((x) => x.user_id === data.user_id && x.active === true);
  if (!u) throw Error("Akun tidak aktif.");
  return u;
}
function requireSession_(body, roles) {
  const u = session_(body.session_token);
  if (roles && roles.indexOf(u.role) < 0) throw Error("Akses ditolak.");
  return u;
}
function analyzeUsersMigration_(values) {
  const headers = (values[0] || []).map((h) => String(h).trim());
  const normalized = headers.map((h) => h.toLowerCase());
  const index = Object.fromEntries(headers.map((h, i) => [h, i]));
  const target = APP.SHEETS.Users;
  const mergedHeaders = headers.filter((h) => /\s+/.test(h) && !target.includes(h));
  const usernameSources = ["username", "user_name", "login", "email", "password", "password_hash", "password_salt"]
    .filter((h) => normalized.includes(h));
  const conflicts = [];
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
  rows.forEach((r) => { if (r.username) (seen[r.username] ||= []).push(r.row); });
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
function login_(b) {
  const username = String(b.username || "").trim().toLowerCase();
  if (!username) throw Error("Username wajib diisi.");
  const u = userRows_().find((x) => String(x.username || "").toLowerCase() === username);
  if (!u) throw Error("Username tidak ditemukan.");
  if (u.active !== true) throw Error("Akun tidak aktif.");
  const token = Utilities.getUuid() + Utilities.getUuid().replace(/-/g, ""), expires = Date.now() + APP.SESSION_TTL;
  PropertiesService.getScriptProperties().setProperty("SESSION_" + token, JSON.stringify({ user_id: u.user_id, expires }));
  return { ok: true, session_token: token, expires, user: publicUser_(u) };
}
function users_(b) {
  requireSession_(b, ["SUPER_ADMIN"]);
  return { ok: true, data: userRows_().map(publicUser_) };
}
function saveUser_(b) {
  const actor = requireSession_(b, ["SUPER_ADMIN"]), username = String(b.username || "").trim().toLowerCase(), name = String(b.display_name || "").trim();
  if (!/^[a-z0-9._-]{3,40}$/.test(username) || !name) throw Error("Data pengguna tidak valid.");
  const role = b.user_id ? role_(b.role) : "ADMIN";
  if (!role || (role === "SUPER_ADMIN" && b.user_id !== actor.user_id)) throw Error("Role pengguna tidak diizinkan.");
  const s = sheet_("Users"), values = s.getDataRange().getValues(), headers = values[0].map((h) => String(h).trim()), idx = Object.fromEntries(headers.map((h, i) => [h, i]));
  if (userRows_().some((u) => String(u.username || "").toLowerCase() === username && u.user_id !== b.user_id)) throw Error("Username sudah digunakan.");
  const now = now_(), row = b.user_id ? values.findIndex((r, i) => i > 0 && r[idx.user_id] === b.user_id) : -1;
  if (row < 1) s.appendRow([uid_(), username, name, "ADMIN", b.active !== false, now, now, actor.user_id]);
  else { const r = row + 1; [ ["username", username], ["display_name", name], ["role", role], ["active", bool_(b.active)], ["updated_at", now] ].forEach(([h, v]) => s.getRange(r, idx[h] + 1).setValue(v)); }
  return { ok: true };
}
function logout_(b) { if (b.session_token) PropertiesService.getScriptProperties().deleteProperty("SESSION_" + b.session_token); return { ok: true }; }
function setupProject() {
  const p = PropertiesService.getScriptProperties();
  const spreadsheetId = p.getProperty("SPREADSHEET_ID") || SPREADSHEET_ID;
  let ss = spreadsheetId
    ? SpreadsheetApp.openById(spreadsheetId)
    : SpreadsheetApp.create("THR Management Database");
  p.setProperty("SPREADSHEET_ID", ss.getId());
  let folder = p.getProperty("FOLDER_ID")
    ? DriveApp.getFolderById(p.getProperty("FOLDER_ID"))
    : DriveApp.createFolder("Bukti THR");
  p.setProperty("FOLDER_ID", folder.getId());
  Object.keys(APP.SHEETS).forEach((n) => {
    let s = ss.getSheetByName(n) || ss.insertSheet(n);
    if (s.getLastRow() === 0) s.appendRow(APP.SHEETS[n]);
  });
  migrateUsers_();
  return { spreadsheetId: ss.getId(), folderId: folder.getId() };
}
function formatSpreadsheet() {
  const spreadsheetId = PropertiesService.getScriptProperties().getProperty("SPREADSHEET_ID") || SPREADSHEET_ID;
  if (!spreadsheetId) {
    throw Error("SPREADSHEET_ID belum tersedia. Jalankan setupProject() terlebih dahulu.");
  }

  const spreadsheet = SpreadsheetApp.openById(spreadsheetId);
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
function sheet_(n) {
  const id =
    PropertiesService.getScriptProperties().getProperty("SPREADSHEET_ID") || SPREADSHEET_ID;
  return SpreadsheetApp.openById(id).getSheetByName(n);
}
function rows_(n) {
  const values = sheet_(n).getDataRange().getValues();
  if (values.length < 2) return [];
  const headers = values[0].map((h) => String(h).trim());
  return values.slice(1).map((r) => Object.fromEntries(headers.map((h, i) => [h, r[i]])));
}
function actor_(body) {
  return requireSession_(body);
}
function require_(body, roles) {
  return requireSession_(body, roles);
}
function log_(u, a, t, id, d) {
  sheet_("AuditLogs").appendRow([
    uid_(),
    u.user_id,
    a,
    t,
    id,
    now_(),
    JSON.stringify(d || {}),
  ]);
}
function route_(b) {
  const action = b.action;
  if (action === "login") return login_(b);
  if (action === "logout") return logout_(b);
  if (action === "health") return { ok: true, now: now_() };
  if (action === "users") return users_(b);
  if (action === "save_user") return saveUser_(b);
  if (action === "list") {
    requireSession_(b, ["ADMIN"]);
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
  throw Error("Action tidak dikenal.");
}
function create_(b) {
  const u = require_(b, ["ADMIN"]);
  if (!b.idempotency_key) throw Error("Idempotency key wajib.");
  const old = rows_("Transactions").find(
    (x) => x.idempotency_key === b.idempotency_key,
  );
  if (old) return { ok: true, data: old, duplicate: true };
  if (!b.photo || typeof b.photo.dataUrl !== "string")
    throw Error("Foto wajib.");
  const m = b.photo.dataUrl.match(
    /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/,
  );
  if (!m) throw Error("Format foto tidak valid.");
  const bytes = Utilities.base64Decode(m[2]);
  if (bytes.length > APP.MAX_BYTES) throw Error("Foto maksimal 5 MB.");
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  let f;
  try {
    const folder = DriveApp.getFolderById(
      PropertiesService.getScriptProperties().getProperty("FOLDER_ID"),
    );
    f = folder.createFile(Utilities.newBlob(bytes, m[1], "THR_" + uid_()));
    const id = uid_(),
      t = now_();
    sheet_("Transactions").appendRow([
      id,
      b.recipient_id || "",
      String(b.recipient_name || "").trim(),
      String(b.item_name || "").trim(),
      u.user_id,
      u.display_name,
      t,
      f.getId(),
      String(b.notes || "").slice(0, 500),
      "ACTIVE",
      t,
      t,
      b.idempotency_key,
    ]);
    log_(u, "CREATE", "TRANSACTION", id, b);
    return {
      ok: true,
      data: {
        transaction_id: id,
        drive_file_id: f.getId(),
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
function delete_(b) {
  const u = require_(b, ["ADMIN"]),
    s = sheet_("Transactions"),
    r = rows_("Transactions").find(
      (x) => x.transaction_id === b.transaction_id,
    );
  if (!r) throw Error("Transaksi tidak ditemukan.");
  const vals = s.getDataRange().getValues(), headers = vals[0].map((h) => String(h).trim());
  const idColumn = headers.indexOf("transaction_id"), statusColumn = headers.indexOf("status"), updatedColumn = headers.indexOf("updated_at");
  for (let i = 1; i < vals.length; i++)
    if (vals[i][idColumn] === b.transaction_id) {
      s.getRange(i + 1, statusColumn + 1).setValue("DELETED");
      s.getRange(i + 1, updatedColumn + 1).setValue(now_());
      break;
    }
  log_(u, "DELETE", "TRANSACTION", b.transaction_id, {});
  return { ok: true };
}
