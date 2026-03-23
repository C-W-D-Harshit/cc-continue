import { execFileSync } from "node:child_process";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { getGitContext } from "../src/git.js";

function git(args: string[], cwd: string): void {
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
  assert.equal(gitContext.untracked[0]?.path, "notes.md");
  assert.match(gitContext.untracked[0]?.preview || "", /Pending work/);
});
