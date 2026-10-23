const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

const source = fs.readFileSync(require("node:path").join(__dirname, "..", "Code.gs"), "utf8");
const context = {};
vm.createContext(context);
vm.runInContext(source, context);

assert.equal(context.roleChangeAllowed_("SUPER_ADMIN", "SUPER_ADMIN"), true);
assert.equal(context.roleChangeAllowed_("SUPER_ADMIN", "ADMIN"), true);
assert.equal(context.roleChangeAllowed_("ADMIN", "SUPER_ADMIN"), false);
assert.equal(context.roleChangeAllowed_("ADMIN", "ADMIN"), true);
assert.equal(context.roleChangeAllowed_("SUPER_ADMIN", "OWNER"), false);

console.log("role-policy tests passed");
