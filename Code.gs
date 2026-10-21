const APP = {
  TZ: "Asia/Jakarta",
  MAX_BYTES: 5 * 1024 * 1024,
  MIME: ["image/jpeg", "image/png", "image/webp"],
  SHEETS: {
    Users: [
      "user_id",
      "email",
      "display_name",
      "role",
      "active",
      "created_at",
      "updated_at",
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
function setupProject() {
  const p = PropertiesService.getScriptProperties();
  let ss = p.getProperty("SPREADSHEET_ID")
    ? SpreadsheetApp.openById(p.getProperty("SPREADSHEET_ID"))
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
  return { spreadsheetId: ss.getId(), folderId: folder.getId() };
}
function formatSpreadsheet() {
  const spreadsheetId = PropertiesService.getScriptProperties().getProperty(
    "SPREADSHEET_ID",
  );
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
    PropertiesService.getScriptProperties().getProperty("SPREADSHEET_ID");
  if (!id) throw Error("Jalankan setupProject terlebih dahulu.");
  return SpreadsheetApp.openById(id).getSheetByName(n);
}
function rows_(n) {
  const s = sheet_(n),
    v = s.getDataRange().getValues();
  return v.length < 2
    ? []
    : v
        .slice(1)
        .map((r) => Object.fromEntries(APP.SHEETS[n].map((h, i) => [h, r[i]])));
}
function actor_(body) {
  const email = Session.getActiveUser().getEmail();
  if (!email)
    throw Error(
      "Identitas Google tidak tersedia. Gunakan deployment Execute as user dalam Google Workspace.",
    );
  const u = rows_("Users").find(
    (x) =>
      String(x.email).toLowerCase() === email.toLowerCase() &&
      x.active === true,
  );
  if (!u) throw Error("Pengguna belum terdaftar atau tidak aktif.");
  return u;
}
function require_(body, roles) {
  const u = actor_(body);
  if (roles.indexOf(u.role) < 0) throw Error("Akses ditolak.");
  return u;
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
  if (action === "health") return { ok: true, now: now_() };
  if (action === "bootstrap") {
    return bootstrap_(b.email, b.display_name);
  }
  if (action === "list")
    return {
      ok: true,
      data: rows_("Transactions")
        .filter((x) => x.status !== "DELETED")
        .reverse()
        .slice(0, 500),
    };
  if (action === "create") return create_(b);
  if (action === "delete") return delete_(b);
  if (action === "users") return { ok: true, data: rows_("Users") };
  throw Error("Action tidak dikenal.");
}
function bootstrap_(email, name) {
  if (rows_("Users").length) throw Error("Bootstrap sudah dilakukan.");
  if (!email) throw Error("Email bootstrap wajib.");
  const u = [uid_(), email, name || email, "SUPER_ADMIN", true, now_(), now_()];
  sheet_("Users").appendRow(u);
  return { ok: true, user_id: u[0] };
}
function create_(b) {
  const u = require_(b, ["SUPER_ADMIN", "ADMIN", "OPERATOR"]);
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
  const u = require_(b, ["SUPER_ADMIN", "ADMIN"]),
    s = sheet_("Transactions"),
    r = rows_("Transactions").find(
      (x) => x.transaction_id === b.transaction_id,
    );
  if (!r) throw Error("Transaksi tidak ditemukan.");
  const vals = s.getDataRange().getValues();
  for (let i = 1; i < vals.length; i++)
    if (vals[i][0] === b.transaction_id) {
      s.getRange(i + 1, 10).setValue("DELETED");
      s.getRange(i + 1, 12).setValue(now_());
      break;
    }
  log_(u, "DELETE", "TRANSACTION", b.transaction_id, {});
  return { ok: true };
}
