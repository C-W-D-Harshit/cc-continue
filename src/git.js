const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

function runGit(args, cwd, timeout = 5000) {
  try {
    const stdout = execFileSync("git", args, {
      cwd,
      encoding: "utf8",
      timeout,
      stdio: ["ignore", "pipe", "pipe"],
    });
    return { ok: true, stdout: stdout.trim() };
  } catch (error) {
    return {
      ok: false,
      stdout: "",
      stderr: error.stderr ? String(error.stderr).trim() : "",
      code: typeof error.status === "number" ? error.status : 1,
    };
  }
}

function truncate(text, maxChars) {
  if (!text) return "";
  if (text.length <= maxChars) return text;
  return `${text.slice(0, maxChars)}\n... [truncated ${text.length - maxChars} chars]`;
}

function readUntrackedPreview(cwd, relativePath, maxChars) {
  try {
    const fullPath = path.join(cwd, relativePath);
    const buffer = fs.readFileSync(fullPath);
    if (buffer.includes(0)) {
      return null;
    }
    return truncate(buffer.toString("utf8"), maxChars);
  } catch {
    return null;
  }
}

function getGitContext(cwd, options = {}) {
  const maxDiffChars = options.maxDiffChars || 12000;
  const maxUntrackedPreviewChars = options.maxUntrackedPreviewChars || 1500;
  const repoCheck = runGit(["rev-parse", "--is-inside-work-tree"], cwd, 3000);

  if (!repoCheck.ok || repoCheck.stdout !== "true") {
    return {
      isGitRepo: false,
      branch: null,
      status: "",
      staged: { stat: "", diff: "" },
      unstaged: { stat: "", diff: "" },
      untracked: [],
      hasChanges: false,
    };
  }

  const branchResult = runGit(["branch", "--show-current"], cwd, 3000);
  const detachedResult = runGit(["rev-parse", "--short", "HEAD"], cwd, 3000);
  const branch =
    branchResult.ok && branchResult.stdout
      ? branchResult.stdout
      : detachedResult.ok && detachedResult.stdout
        ? `detached@${detachedResult.stdout}`
        : null;

  const statusResult = runGit(["status", "--short", "--untracked-files=all"], cwd, 5000);
  const status = statusResult.ok ? statusResult.stdout : "";

  const stagedStatResult = runGit(["diff", "--cached", "--stat"], cwd, 5000);
  const stagedDiffResult = runGit(["diff", "--cached"], cwd, 5000);
  const unstagedStatResult = runGit(["diff", "--stat"], cwd, 5000);
  const unstagedDiffResult = runGit(["diff"], cwd, 5000);
  const untrackedResult = runGit(["ls-files", "--others", "--exclude-standard"], cwd, 5000);

  const untracked = (untrackedResult.ok ? untrackedResult.stdout.split("\n") : [])
    .map((item) => item.trim())
    .filter(Boolean)
    .map((relativePath) => ({
      path: relativePath,
      preview: readUntrackedPreview(cwd, relativePath, maxUntrackedPreviewChars),
    }));

  const stagedDiff = truncate(stagedDiffResult.ok ? stagedDiffResult.stdout : "", maxDiffChars / 2);
  const unstagedDiff = truncate(
    unstagedDiffResult.ok ? unstagedDiffResult.stdout : "",
    maxDiffChars / 2
  );

  return {
    isGitRepo: true,
    branch,
    status,
    staged: {
      stat: stagedStatResult.ok ? stagedStatResult.stdout : "",
      diff: stagedDiff,
    },
    unstaged: {
      stat: unstagedStatResult.ok ? unstagedStatResult.stdout : "",
      diff: unstagedDiff,
    },
    untracked,
    hasChanges:
      Boolean(status) ||
      Boolean(stagedDiff) ||
      Boolean(unstagedDiff) ||
      untracked.length > 0,
  };
}

module.exports = {
  getGitContext,
};
