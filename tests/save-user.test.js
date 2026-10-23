const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

// Harness minimal Apps Script: cukup untuk menembus route_("save_user") ->
// requireSession_ -> saveUser_ -> log_ tanpa layanan Google.
const source = fs.readFileSync(path.join(__dirname, "..", "Code.gs"), "utf8");
const BUILD = "role-policy-2026-10-23";

function fakeSheet(rows) {
  return {
    rows,
    getDataRange() {
      return { getValues: () => rows.map((r) => r.slice()) };
    },
    appendRow(row) {
      rows.push(row.slice());
    },
    getRange(rowNumber, columnNumber) {
      return {
        setValue(value) {
          while (rows.length < rowNumber) rows.push([]);
          const target = rows[rowNumber - 1];
          while (target.length < columnNumber) target.push("");
          target[columnNumber - 1] = value;
        },
      };
    },
  };
}

function boot(users) {
  const warnings = [];
  const props = new Map([["SPREADSHEET_ID", "ss-test"]]);
  let uuid = 0;
  const context = vm.createContext({ console: { warn: (...a) => warnings.push(a.join(" ")), error() {}, log() {} } });
  vm.runInContext(source, context);

  const usersHeaders = vm.runInContext("APP.SHEETS.Users", context);
  const auditHeaders = vm.runInContext("APP.SHEETS.AuditLogs", context);
  const toRow = (record) => usersHeaders.map((h) => (record[h] === undefined ? "" : record[h]));
  const usersSheet = fakeSheet([usersHeaders.slice(), ...users.map(toRow)]);
  const auditSheet = fakeSheet([auditHeaders.slice()]);
  const sheets = { Users: usersSheet, AuditLogs: auditSheet };

  context.PropertiesService = {
    getScriptProperties: () => ({
      getProperty: (key) => (props.has(key) ? props.get(key) : null),
      setProperty: (key, value) => props.set(key, String(value)),
      deleteProperty: (key) => props.delete(key),
    }),
  };
  context.SpreadsheetApp = { openById: () => ({ getSheetByName: (name) => sheets[name] || null }) };
  context.LockService = { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) };
  context.Utilities = { formatDate: () => "2026-10-23T10:00:00+07:00", getUuid: () => "uuid-" + ++uuid };
  context.ContentService = {
    createTextOutput: (text) => ({ text, setMimeType() { return this; } }),
    MimeType: { JSON: "json" },
  };

  const cell = (userId, field) => {
    const idIndex = usersHeaders.indexOf("user_id");
    const fieldIndex = usersHeaders.indexOf(field);
    const match = usersSheet.rows.slice(1).find((r) => String(r[idIndex]) === userId);
    return match ? match[fieldIndex] : undefined;
  };
  const call = (action, payload) => context.route_({ action, ...payload });

  return { context, props, usersSheet, auditSheet, warnings, cell, call };
}

function login(app, userId, ttl = 3600000) {
  const token = "tok-" + userId;
  app.props.set("SESSION_" + token, JSON.stringify({ user_id: userId, expires: Date.now() + ttl }));
  return token;
}

const USERS = [
  { user_id: "u1", username: "super.admin", display_name: "Super Admin", role: "SUPER_ADMIN", active: true, created_at: "x", updated_at: "x", created_by: "system" },
  { user_id: "u2", username: "sari", display_name: "Sari", role: "ADMIN", active: true, created_at: "x", updated_at: "x", created_by: "u1" },
  { user_id: "u3", username: "andi", display_name: "Andi", role: "ADMIN", active: true, created_at: "x", updated_at: "x", created_by: "u1" },
];

function expectThrow(fn) {
  try {
    fn();
  } catch (e) {
    return e;
  }
  throw new Error("Diharapkan melempar error, tetapi berhasil.");
}

// 1. SUPER_ADMIN memberi SUPER_ADMIN ke pengguna lain (kasus yang gagal di Web App).
{
  const app = boot(USERS);
  const token = login(app, "u1");
  const res = app.call("save_user", { session_token: token, user_id: "u2", username: "sari", display_name: "Sari", role: "SUPER_ADMIN", active: true });
  assert.equal(res.ok, true);
  assert.equal(app.cell("u2", "role"), "SUPER_ADMIN");
  assert.equal(app.auditSheet.rows.length, 2);
  assert.match(String(app.auditSheet.rows[1][6]), /"role":"SUPER_ADMIN"/);
  assert.deepEqual(app.warnings, []);
}

// 2. Turunkan SUPER_ADMIN lain ke ADMIN tetap diizinkan.
{
  const app = boot(USERS.map((u) => (u.user_id === "u2" ? { ...u, role: "SUPER_ADMIN" } : u)));
  const token = login(app, "u1");
  app.call("save_user", { session_token: token, user_id: "u2", username: "sari", display_name: "Sari", role: "ADMIN", active: true });
  assert.equal(app.cell("u2", "role"), "ADMIN");
}

// 3. Sesi ADMIN ditolak requireSession_ dengan pesan berbeda dari pesan role.
{
  const app = boot(USERS);
  const token = login(app, "u3");
  const error = expectThrow(() => app.call("save_user", { session_token: token, user_id: "u2", username: "sari", display_name: "Sari", role: "SUPER_ADMIN", active: true }));
  assert.equal(error.code, "FORBIDDEN");
  assert.equal(error.message, "Akses ditolak.");
  assert.equal(app.cell("u2", "role"), "ADMIN");
  assert.equal(app.auditSheet.rows.length, 1);
  assert.deepEqual(app.warnings, []);
}

// 4. Role target tidak dikenal: pesan pengguna tetap, tahap hanya ke console.
{
  const app = boot(USERS);
  const token = login(app, "u1");
  const error = expectThrow(() => app.call("save_user", { session_token: token, user_id: "u2", username: "sari", display_name: "Sari", role: "OWNER", active: true }));
  assert.equal(error.message, "Role pengguna tidak diizinkan.");
  assert.equal(app.warnings.length, 1);
  const diag = JSON.parse(app.warnings[0]);
  assert.equal(diag.stage, "target_role_invalid");
  assert.equal(diag.build, BUILD);
  assert.equal(diag.actorRole, "SUPER_ADMIN");
  assert.equal(diag.targetRole, "UNKNOWN");
  assert.ok(!app.warnings[0].includes(token), "diagnostik tidak boleh memuat token sesi");
  assert.ok(!/sari|u2|andi/.test(app.warnings[0]), "diagnostik tidak boleh memuat identitas pengguna");
  assert.equal(app.cell("u2", "role"), "ADMIN");
}

// 5. Validasi input tetap berjalan sebelum pemeriksaan role.
{
  const app = boot(USERS);
  const token = login(app, "u1");
  const error = expectThrow(() => app.call("save_user", { session_token: token, user_id: "u2", username: "a b", display_name: "", role: "ADMIN" }));
  assert.equal(error.message, "Data pengguna tidak valid.");
  assert.deepEqual(app.warnings, []);
}

// 6. Sesi kedaluwarsa tidak sampai ke pemeriksaan role.
{
  const app = boot(USERS);
  const token = login(app, "u1", -1000);
  const error = expectThrow(() => app.call("save_user", { session_token: token, user_id: "u2", username: "sari", display_name: "Sari", role: "SUPER_ADMIN" }));
  assert.equal(error.code, "SESSION_EXPIRED");
  assert.deepEqual(app.warnings, []);
}

// 7. Pengguna baru selalu ADMIN (perilaku lama dipertahankan).
{
  const app = boot(USERS);
  const token = login(app, "u1");
  app.call("save_user", { session_token: token, username: "baru.user", display_name: "Baru", role: "SUPER_ADMIN", active: true });
  assert.equal(app.cell("uuid-1", "role"), "ADMIN");
  assert.equal(app.usersSheet.rows.length, 5);
}

// 8. Marker build terekspos lewat doGet agar versi deployment bisa dipastikan.
{
  const app = boot(USERS);
  const body = JSON.parse(app.context.doGet().text);
  assert.equal(body.ok, true);
  assert.equal(body.build, BUILD);
  assert.equal(app.context.route_({ action: "health" }).build, BUILD);
}

console.log("save-user tests passed");
