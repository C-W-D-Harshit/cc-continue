const test = require("node:test");
const assert = require("node:assert/strict");
const { parseArgs } = require("../src/args");

test("parseArgs handles product flags", () => {
  const parsed = parseArgs([
    "--raw",
    "--copy",
    "--session",
    "abc123",
    "--provider",
    "openrouter",
    "--model",
    "openrouter/auto",
    "--target",
    "codex",
    "--output",
    "./handoff.md",
  ]);

  assert.equal(parsed.raw, true);
  assert.equal(parsed.copy, true);
  assert.equal(parsed.session, "abc123");
  assert.equal(parsed.provider, "openrouter");
  assert.equal(parsed.model, "openrouter/auto");
  assert.equal(parsed.target, "codex");
  assert.match(parsed.output, /handoff\.md$/);
});

test("parseArgs supports doctor command", () => {
  const parsed = parseArgs(["doctor", "--provider", "openrouter"]);
  assert.equal(parsed.command, "doctor");
  assert.equal(parsed.provider, "openrouter");
});

test("parseArgs supports sessions command and limit", () => {
  const parsed = parseArgs(["sessions", "--limit", "5"]);
  assert.equal(parsed.command, "sessions");
  assert.equal(parsed.limit, 5);
});
