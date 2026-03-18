const fs = require("fs");
const os = require("os");
const path = require("path");
const test = require("node:test");
const assert = require("node:assert/strict");
const { execFileSync } = require("child_process");
const { getGitContext } = require("../src/git");

function git(args, cwd) {
  execFileSync("git", args, {
    cwd,
    stdio: "ignore",
  });
}

test("getGitContext captures status, diffs, and untracked previews", () => {
  const repoDir = fs.mkdtempSync(path.join(os.tmpdir(), "cc-continue-git-"));

  git(["init"], repoDir);
  git(["config", "user.email", "test@example.com"], repoDir);
  git(["config", "user.name", "Test User"], repoDir);

  fs.writeFileSync(path.join(repoDir, "tracked.txt"), "hello\n");
  git(["add", "tracked.txt"], repoDir);
  git(["commit", "-m", "init"], repoDir);

  fs.writeFileSync(path.join(repoDir, "tracked.txt"), "hello world\n");
  fs.writeFileSync(path.join(repoDir, "notes.md"), "# Draft\n\nPending work.\n");

  const gitContext = getGitContext(repoDir, {
    maxDiffChars: 4000,
    maxUntrackedPreviewChars: 500,
  });

  assert.equal(gitContext.isGitRepo, true);
  assert.match(gitContext.status, /tracked\.txt/);
  assert.match(gitContext.status, /\?\? notes\.md/);
  assert.match(gitContext.unstaged.diff, /hello world/);
  assert.equal(gitContext.untracked[0].path, "notes.md");
  assert.match(gitContext.untracked[0].preview, /Pending work/);
});
