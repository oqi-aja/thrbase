const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const source = fs.readFileSync(path.join(__dirname, "..", "Code.gs"), "utf8");
const start = source.indexOf("function bool_");
const end = source.indexOf("function previewUsersMigration");
const context = {
  APP: { SHEETS: { Users: ["user_id", "username", "display_name", "role", "active", "created_at", "updated_at", "created_by"] } },
};
vm.runInNewContext(source.slice(start, end), context);
const analyze = vm.runInNewContext("analyzeUsersMigration_", context);
const role = vm.runInNewContext("role_", context);
const bool = vm.runInNewContext("bool_", context);

assert.equal(role("SUPER_ADMIN"), "SUPER_ADMIN");
assert.equal(role("VIEWER"), "");
for (const value of [true, "TRUE", "1", "yes", "ya", "aktif"]) assert.equal(bool(value), true);
for (const value of [false, "FALSE", "0", "no", "tidak", "nonaktif"]) assert.equal(bool(value), false);

const headers = ["user_id", "username", "display_name", "role", "active", "created_at", "updated_at", "created_by"];
assert.equal(analyze([headers, ["1", "admin", "Admin", "SUPER_ADMIN", true, "", "", "owner"]]).safe, true);
const merged = analyze([["user_id email", "display_name", "role active"], ["1", "Admin", "SUPER_ADMIN"]]);
assert.ok(merged.mergedHeaders.includes("user_id email"));
assert.ok(merged.mergedHeaders.includes("role active"));
assert.equal(merged.safe, false);
const legacy = analyze([["user_id", "email", "password_hash", "role", "active"], ["1", "a@example.test", "hash", "ADMIN", "TRUE"]]);
assert.ok(legacy.conflicts.some((x) => x.type === "email_not_username"));
assert.ok(legacy.conflicts.some((x) => x.type === "password_not_username"));
const conflicts = analyze([headers, ["1", "same", "A", "ADMIN", "FALSE", "", "", ""], ["2", "same", "B", "VIEWER", "maybe", "", "", ""]]);
assert.ok(conflicts.conflicts.some((x) => x.type === "duplicate_username"));
assert.ok(conflicts.conflicts.some((x) => x.type === "row" && x.issues.includes("role_not_allowed")));
assert.ok(conflicts.conflicts.some((x) => x.type === "row" && x.issues.includes("active_unknown")));

const route = source.slice(source.indexOf("function route_"), source.indexOf("function create_"));
assert.match(route, /requireSession_\(b, \["ADMIN"\]\)/);
assert.match(source, /Date\.now\(\) > data\.expires/);
assert.match(source, /f\.setTrashed\(true\)/);
assert.match(source, /idempotency_key/);
assert.match(source, /headers\.indexOf\("transaction_id"\)/);
assert.doesNotMatch(route, /bootstrapAppUser/);
console.log("THR local tests passed");
