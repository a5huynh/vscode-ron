const test = require("node:test");
const assert = require("node:assert/strict");
const { buildArgs, acceptOutput } = require("../out/args");

const defaults = { maxWidth: null, tabSize: null, extraArgs: [] };

test("no settings, no file: plain stdin run", () => {
  assert.deepEqual(buildArgs(defaults, undefined), []);
});

test("file path is passed so fmt.ron is discovered", () => {
  assert.deepEqual(buildArgs(defaults, "/proj/a.ron"), ["--stdin-filepath", "/proj/a.ron"]);
});

test("width and tab size are only passed when set", () => {
  assert.deepEqual(
    buildArgs({ ...defaults, maxWidth: 100, tabSize: 2 }, "/a.ron"),
    ["--stdin-filepath", "/a.ron", "-w", "100", "-t", "2"]
  );
  assert.deepEqual(buildArgs({ ...defaults, tabSize: 2 }, undefined), ["-t", "2"]);
});

test("invalid width / tab size are ignored", () => {
  for (const bad of [0, -1, 1.5, NaN, "80", undefined]) {
    assert.deepEqual(buildArgs({ ...defaults, maxWidth: bad, tabSize: bad }, undefined), []);
  }
});

test("extraArgs are appended last, non-strings dropped", () => {
  assert.deepEqual(
    buildArgs({ ...defaults, maxWidth: 80, extraArgs: ["--blank-lines", "remove", 3, null] }, undefined),
    ["-w", "80", "--blank-lines", "remove"]
  );
});

test("acceptOutput: changed output is used", () => {
  assert.equal(acceptOutput("(a:1)", "(a: 1)\n"), "(a: 1)\n");
});

test("acceptOutput: unchanged output means no edit", () => {
  assert.equal(acceptOutput("(a: 1)\n", "(a: 1)\n"), undefined);
});

test("acceptOutput: empty output never wipes a non-empty document", () => {
  assert.equal(acceptOutput("(a: 1)", ""), undefined);
  assert.equal(acceptOutput("(a: 1)", "  \n"), undefined);
});

test("acceptOutput: whitespace-only document may be emptied", () => {
  assert.equal(acceptOutput("\n\n", ""), "");
});
