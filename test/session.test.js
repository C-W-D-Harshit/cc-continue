const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("path");
const { buildSessionContext, parseSession } = require("../src/session");

test("parseSession extracts nested progress tool calls and ignores tool-only user results", () => {
  const fixture = path.join(__dirname, "fixtures", "sample-session.jsonl");
  const { messages, meta } = parseSession(fixture);

  assert.equal(meta.sessionId, "demo-session");
  assert.equal(meta.gitBranch, "feature/demo");
  assert.equal(messages.length, 5);

  const assistantWithBash = messages.find(
    (message) => message.role === "assistant" && message.toolCalls.some((call) => call.tool === "Bash")
  );

  assert.ok(assistantWithBash);

  const ctx = buildSessionContext({
    messages,
    meta,
    cwd: "/tmp/project",
    sessionPath: fixture,
    gitContext: {
      isGitRepo: false,
      branch: null,
      status: "",
      staged: { stat: "", diff: "" },
      unstaged: { stat: "", diff: "" },
      untracked: [],
      hasChanges: false,
    },
  });

  assert.deepEqual(ctx.filesModified, ["/tmp/project/src/auth.js"]);
  assert.deepEqual(ctx.filesRead, ["/tmp/project/src/auth.js"]);
  assert.deepEqual(ctx.commands, ["npm test"]);
});
