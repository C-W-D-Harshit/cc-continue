import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import type { GitContext } from "./types.js";

function runGit(args: string[], cwd: string, timeout: number = 5000) {
  try {
    const stdout = execFileSync("git", args, {
      cwd,
      encoding: "utf8",
      timeout,
      stdio: ["ignore", "pipe", "pipe"],
    });
    return { ok: true as const, stdout: stdout.trim() };
  } catch (error) {
    const gitError = error as NodeJS.ErrnoException & { stderr?: string | Buffer; status?: number };
    return {
      ok: false as const,
      stdout: "",
      stderr: gitError.stderr ? String(gitError.stderr).trim() : "",
      code: typeof gitError.status === "number" ? gitError.status : 1,
    };
  }
}

function truncate(text: string, maxChars: number): string {
  if (!text) return "";
  if (text.length <= maxChars) return text;
  return `${text.slice(0, maxChars)}\n... [truncated ${text.length - maxChars} chars]`;
}

function readUntrackedPreview(cwd: string, relativePath: string, maxChars: number): string | null {
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

export function getGitContext(
  cwd: string,
  options: { maxDiffChars?: number; maxUntrackedPreviewChars?: number } = {}
): GitContext {
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
      recentCommits: "",
      committedDiff: "",
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
  const unstagedDiff = truncate(unstagedDiffResult.ok ? unstagedDiffResult.stdout : "", maxDiffChars / 2);

  const recentCommitsResult = runGit(["log", "--oneline", "-15"], cwd, 5000);
  const recentCommits = recentCommitsResult.ok ? recentCommitsResult.stdout : "";

  let committedDiff = "";
  if (recentCommits) {
    const commitCount = recentCommits.split("\n").filter(Boolean).length;
    const diffDepth = Math.min(commitCount, 8);
    const committedDiffResult = runGit(["diff", `HEAD~${diffDepth}..HEAD`, "--stat"], cwd, 5000);
    committedDiff = committedDiffResult.ok ? truncate(committedDiffResult.stdout, maxDiffChars / 2) : "";
  }

  return {
    isGitRepo: true,
    branch,
    status: statusResult.ok ? statusResult.stdout : "",
    staged: {
      stat: stagedStatResult.ok ? stagedStatResult.stdout : "",
      diff: stagedDiff,
    },
    unstaged: {
      stat: unstagedStatResult.ok ? unstagedStatResult.stdout : "",
      diff: unstagedDiff,
    },
    untracked,
    hasChanges: Boolean(statusResult.ok ? statusResult.stdout : "") || Boolean(stagedDiff) || Boolean(unstagedDiff) || untracked.length > 0,
    recentCommits,
    committedDiff,
  };
}
