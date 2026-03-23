import fs from "node:fs";
import { getClipboardStrategy } from "./clipboard.js";
import { getApiKey } from "./config.js";
import { getGitContext } from "./git.js";
import { CLAUDE_DIR, PROJECTS_DIR, findLatestSession, listSessionsForProject } from "./session.js";
import type { AppConfig, DoctorReport, Provider } from "./types.js";

export function runDoctor({
  cwd,
  provider,
  cliApiKey,
  env,
  config,
}: {
  cwd: string;
  provider: Provider;
  cliApiKey: string | null;
  env: NodeJS.ProcessEnv;
  config: AppConfig;
}): DoctorReport {
  const checks: DoctorReport["checks"] = [];
  const notes: string[] = [];
  const nextSteps: string[] = [];

  const claudeDirExists = fs.existsSync(CLAUDE_DIR);
  checks.push({
    status: claudeDirExists ? "OK" : "WARN",
    label: "Claude dir",
    detail: claudeDirExists ? CLAUDE_DIR : `Missing: ${CLAUDE_DIR}`,
  });

  const sessions = listSessionsForProject(cwd, PROJECTS_DIR);
  if (sessions.length > 0) {
    checks.push({
      status: "OK",
      label: "Project sessions",
      detail: `${sessions.length} found, latest ${sessions[0].name}`,
    });
  } else {
    checks.push({
      status: "WARN",
      label: "Project sessions",
      detail: "No Claude session files found for the current directory",
    });
    nextSteps.push("Run Claude Code in this project once so a session file exists.");
  }

  const latest = findLatestSession(cwd, PROJECTS_DIR);
  if (latest) {
    checks.push({
      status: "OK",
      label: "Latest session",
      detail: latest.path,
    });
  }

  const gitContext = getGitContext(cwd);
  if (gitContext.isGitRepo) {
    checks.push({
      status: "OK",
      label: "Git",
      detail: gitContext.branch ? `Repo detected on ${gitContext.branch}` : "Repo detected",
    });
  } else {
    checks.push({
      status: "WARN",
      label: "Git",
      detail: "Current directory is not a git repository",
    });
  }

  const apiKey = getApiKey({
    provider,
    cliValue: cliApiKey,
    env,
    config,
  });
  checks.push({
    status: apiKey ? "OK" : "WARN",
    label: "API key",
    detail: apiKey ? `Available for provider ${provider}` : `Missing for provider ${provider}`,
  });

  const clipboard = getClipboardStrategy();
  checks.push({
    status: clipboard ? "OK" : "WARN",
    label: "Clipboard",
    detail: clipboard ? `Using ${clipboard.command}` : "No supported clipboard utility found",
  });

  if (!apiKey) {
    notes.push("Refined mode will prompt for an API key when running interactively.");
    nextSteps.push("Set OPENROUTER_API_KEY or run cc-continue once interactively to save it.");
  }

  if (!gitContext.isGitRepo) {
    notes.push("Raw continuation prompts still work outside git, but code-state fidelity is lower.");
    nextSteps.push("Initialize git in this project if you want better code-state summaries.");
  }

  if (!claudeDirExists) {
    nextSteps.push("Install or run Claude Code so ~/.claude/projects is created.");
  }

  return { checks, notes, nextSteps };
}
