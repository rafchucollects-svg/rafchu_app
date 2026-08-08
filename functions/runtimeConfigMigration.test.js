const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const functionsDirectory = __dirname;

function listProductionJavaScript(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    if (entry.name === "node_modules" || entry.name.startsWith(".")) return [];

    const absolutePath = path.join(directory, entry.name);
    if (entry.isDirectory()) return listProductionJavaScript(absolutePath);
    if (!entry.name.endsWith(".js") || entry.name.endsWith(".test.js")) return [];
    return [absolutePath];
  });
}

function removeComments(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
}

test("production functions do not call the deprecated Runtime Config API", () => {
  const runtimeConfigCall = /functions\s*\.\s*config\s*\(/;
  const offenders = listProductionJavaScript(functionsDirectory)
    .filter((file) => runtimeConfigCall.test(removeComments(fs.readFileSync(file, "utf8"))))
    .map((file) => path.relative(functionsDirectory, file));

  assert.deepEqual(
    offenders,
    [],
    `Migrate deprecated Runtime Config calls to Secret Manager: ${offenders.join(", ")}`,
  );
});
