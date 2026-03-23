import type { ConfidenceReport, DoctorReport, SessionContext, Target } from "./types.js";

function compactText(text: string, maxChars: number = 800): string {
  const compacted = String(text || "").replace(/\s+/g, " ").trim();
  if (compacted.length <= maxChars) return compacted;
  return `${compacted.slice(0, maxChars)}...`;
}

function unique<T>(list: T[]): T[] {
  return [...new Set(list.filter(Boolean))];
}

function selectTranscriptEntries(
  transcript: SessionContext["transcript"],
  options: { tailCount?: number; maxChars?: number } = {}
): string[] {
  const firstUser = transcript.find((entry) => entry.role === "user");
  const tailCount = options.tailCount || 14;
  const maxChars = options.maxChars || 7000;
  const tail = transcript.slice(-tailCount);
  const selected = [];

  if (firstUser) {
    selected.push(firstUser);
  }

  for (const entry of tail) {
    if (!selected.includes(entry)) {
      selected.push(entry);
    }
  }

  let totalChars = 0;
  const result: string[] = [];
  for (const entry of selected) {
    const line = `${entry.role.toUpperCase()}: ${compactText(entry.text, 900)}`;
    if (totalChars + line.length > maxChars) {
      break;
    }
    result.push(line);
    totalChars += line.length;
  }

  return result;
}

export function buildConfidenceReport(ctx: SessionContext): ConfidenceReport {
  const caveats: string[] = [];
  const git = ctx.gitContext;

  if (!git.isGitRepo) {
    caveats.push("Current working directory is not a git repository, so code state is limited to Claude session history.");
  } else if (!git.hasChanges) {
    caveats.push("No local git changes were detected at generation time.");
  }

  if (ctx.filesModified.length === 0) {
    caveats.push("No file-edit tool calls were detected in the parsed session.");
  }

  if (ctx.transcript.length < 3) {
    caveats.push("Parsed transcript is short; verify the selected session is the correct one.");
  }

  return {
    sessionId: ctx.sessionId,
    messageCount: ctx.messages.length,
    filesModified: ctx.filesModified.length,
    filesRead: ctx.filesRead.length,
    commandsCaptured: ctx.commands.length,
    caveats,
  };
}

function formatGitSections(gitContext: SessionContext["gitContext"]): string {
  if (!gitContext.isGitRepo) {
    return "## Git State\n\nNot a git repository.\n";
  }

  const untrackedFiles = gitContext.untracked.slice(0, 6);
  const omittedUntrackedCount = Math.max(gitContext.untracked.length - untrackedFiles.length, 0);
  let output = "## Git State\n\n";

  if (gitContext.branch) {
    output += `Branch: \`${gitContext.branch}\`\n\n`;
  }

  if (gitContext.status) {
    output += "### git status --short\n\n```text\n";
    output += `${gitContext.status}\n`;
    output += "```\n\n";
  }

  if (gitContext.staged.stat) {
    output += "### Staged Changes\n\n```text\n";
    output += `${gitContext.staged.stat}\n`;
    output += "```\n\n";
  }

  if (gitContext.unstaged.stat) {
    output += "### Unstaged Changes\n\n```text\n";
    output += `${gitContext.unstaged.stat}\n`;
    output += "```\n\n";
  }

  if (untrackedFiles.length > 0) {
    output += "### Untracked Files\n\n";
    for (const file of untrackedFiles) {
      output += `- \`${file.path}\`\n`;
      if (file.preview) {
        output += "\n```text\n";
        output += `${file.preview}\n`;
        output += "```\n\n";
      }
    }
    if (omittedUntrackedCount > 0) {
      output += `- ... and ${omittedUntrackedCount} more untracked file(s)\n\n`;
    }
  }

  if (gitContext.staged.diff) {
    output += "### Staged Diff Snippet\n\n```diff\n";
    output += `${gitContext.staged.diff}\n`;
    output += "```\n\n";
  }

  if (gitContext.unstaged.diff) {
    output += "### Unstaged Diff Snippet\n\n```diff\n";
    output += `${gitContext.unstaged.diff}\n`;
    output += "```\n\n";
  }

  return output;
}

function buildTargetGuidance(target: Target | undefined): string {
  switch (target) {
    case "codex":
      return "The next agent is Codex. It should inspect the current files first, avoid redoing completed work, and finish any remaining implementation or verification.";
    case "cursor":
      return "The next agent is Cursor. It should continue the implementation directly from the current workspace state and verify behavior in-editor.";
    case "chatgpt":
      return "The next agent is ChatGPT. It should reason from the current workspace state, explain what remains, and provide explicit next actions.";
    default:
      return "The next agent should continue the interrupted work from the current workspace state without redoing completed steps.";
  }
}

export function buildRawPrompt(ctx: SessionContext, options: { target?: Target } = {}): string {
  const transcript = selectTranscriptEntries(ctx.transcript);
  const userMessages = ctx.messages
    .filter((message) => message.role === "user" && message.content)
    .map((message) => compactText(message.content, 500));
  const confidence = buildConfidenceReport(ctx);

  let prompt = "# Continue Claude Code Session\n\n";
  prompt += `Target: \`${options.target || "generic"}\`\n`;
  prompt += `Project cwd: \`${ctx.sessionCwd}\`\n`;
  prompt += `Session file: \`${ctx.sessionPath}\`\n`;
  if (ctx.branch) {
    prompt += `Branch: \`${ctx.branch}\`\n`;
  }
  prompt += "\n";

  prompt += "## Primary Goal\n\n";
  prompt += `${userMessages[0] || "Continue the interrupted Claude Code session."}\n\n`;

  if (userMessages.length > 1) {
    prompt += "## Latest User Request\n\n";
    prompt += `${userMessages[userMessages.length - 1]}\n\n`;
  }

  prompt += "## Parsed Transcript\n\n";
  for (const line of transcript) {
    prompt += `${line}\n\n`;
  }

  if (ctx.filesModified.length > 0) {
    prompt += "## Files Modified During Session\n\n";
    for (const filePath of unique(ctx.filesModified)) {
      prompt += `- \`${filePath}\`\n`;
    }
    prompt += "\n";
  }

  if (ctx.commands.length > 0) {
    prompt += "## Commands Run\n\n";
    for (const command of unique(ctx.commands).slice(-12)) {
      prompt += `- \`${compactText(command, 180)}\`\n`;
    }
    prompt += "\n";
  }

  prompt += formatGitSections(ctx.gitContext);

  prompt += "## Confidence Report\n\n";
  prompt += `- Parsed messages: ${confidence.messageCount}\n`;
  prompt += `- Edited files detected: ${confidence.filesModified}\n`;
  prompt += `- Read files detected: ${confidence.filesRead}\n`;
  prompt += `- Commands detected: ${confidence.commandsCaptured}\n`;
  for (const caveat of confidence.caveats) {
    prompt += `- Caveat: ${caveat}\n`;
  }
  prompt += "\n";

  prompt += "## Instructions For The Next Agent\n\n";
  prompt += `${buildTargetGuidance(options.target)} `;
  prompt += "Check the current state of modified files first, verify which tasks are already complete, and only then finish the remaining work.\n";

  return prompt;
}

export function buildRefinementDump(ctx: SessionContext, options: { target?: Target } = {}): string {
  const transcript = selectTranscriptEntries(ctx.transcript, { tailCount: 18, maxChars: 9000 });
  const confidence = buildConfidenceReport(ctx);
  const untrackedFiles = ctx.gitContext.untracked.slice(0, 6);
  const omittedUntrackedCount = Math.max(ctx.gitContext.untracked.length - untrackedFiles.length, 0);
  const sections: string[] = [];

  sections.push("=== PROJECT ===");
  sections.push(`Target: ${options.target || "generic"}`);
  sections.push(`Project cwd: ${ctx.sessionCwd}`);
  sections.push(`Session file: ${ctx.sessionPath}`);
  if (ctx.branch) sections.push(`Git branch: ${ctx.branch}`);

  sections.push("\n=== USER GOALS ===");
  const userMessages = ctx.messages
    .filter((message) => message.role === "user" && message.content)
    .map((message) => `- ${compactText(message.content, 600)}`);
  sections.push(userMessages.slice(0, 1).concat(userMessages.slice(-2)).join("\n") || "- No explicit user text found");

  sections.push("\n=== TRANSCRIPT EXCERPT ===");
  sections.push(transcript.join("\n"));

  sections.push("\n=== FILES TOUCHED ===");
  sections.push(
    unique(ctx.filesModified).length > 0
      ? unique(ctx.filesModified).map((filePath) => `- modified: ${filePath}`).join("\n")
      : "- No modified files detected"
  );
  if (ctx.filesRead.length > 0) {
    sections.push(unique(ctx.filesRead).slice(0, 20).map((filePath) => `- read: ${filePath}`).join("\n"));
  }

  sections.push("\n=== COMMANDS ===");
  sections.push(
    ctx.commands.length > 0
      ? unique(ctx.commands).slice(-12).map((command) => `- ${compactText(command, 200)}`).join("\n")
      : "- No shell commands detected"
  );

  sections.push("\n=== GIT STATUS ===");
  sections.push(ctx.gitContext.status || "No git status entries");
  if (ctx.gitContext.staged.stat) {
    sections.push("\n--- STAGED STAT ---");
    sections.push(ctx.gitContext.staged.stat);
  }
  if (ctx.gitContext.unstaged.stat) {
    sections.push("\n--- UNSTAGED STAT ---");
    sections.push(ctx.gitContext.unstaged.stat);
  }
  if (ctx.gitContext.staged.diff) {
    sections.push("\n--- STAGED DIFF ---");
    sections.push(ctx.gitContext.staged.diff);
  }
  if (ctx.gitContext.unstaged.diff) {
    sections.push("\n--- UNSTAGED DIFF ---");
    sections.push(ctx.gitContext.unstaged.diff);
  }
  if (untrackedFiles.length > 0) {
    sections.push("\n--- UNTRACKED FILES ---");
    sections.push(
      untrackedFiles
        .map((file) => {
          if (!file.preview) return file.path;
          return `${file.path}\n${file.preview}`;
        })
        .join("\n\n")
    );
    if (omittedUntrackedCount > 0) {
      sections.push(`... and ${omittedUntrackedCount} more untracked file(s)`);
    }
  }

  sections.push("\n=== CONFIDENCE REPORT ===");
  sections.push(
    [
      `sessionId=${confidence.sessionId}`,
      `messageCount=${confidence.messageCount}`,
      `filesModified=${confidence.filesModified}`,
      `filesRead=${confidence.filesRead}`,
      `commandsCaptured=${confidence.commandsCaptured}`,
      ...confidence.caveats.map((caveat) => `caveat=${caveat}`),
    ].join("\n")
  );

  return sections.join("\n");
}

export function buildRefinementSystemPrompt(target: Target): string {
  return [
    "You create continuation prompts for AI coding agents.",
    "You receive a structured dump of an interrupted Claude Code session.",
    "Produce a concise but complete handoff prompt that another agent can immediately act on.",
    "The prompt must include:",
    "1. Context",
    "2. What the user asked for",
    "3. What was already completed",
    "4. What remains",
    "5. Current code state from git",
    "6. Confidence or caveats when the data is incomplete",
    `Target agent: ${target}. Tailor the final handoff wording for that target.`,
    "Output only the handoff prompt. No preamble.",
  ].join("\n");
}

export function formatDoctorReport(report: DoctorReport): string {
  const lines = ["cc-continue doctor", ""];

  for (const check of report.checks) {
    lines.push(`${check.status.padEnd(4)} ${check.label}: ${check.detail}`);
  }

  if (report.notes.length > 0) {
    lines.push("");
    lines.push("Notes");
    for (const note of report.notes) {
      lines.push(`- ${note}`);
    }
  }

  return lines.join("\n");
}
