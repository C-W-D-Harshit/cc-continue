const fs = require("fs");
const os = require("os");
const path = require("path");

const CLAUDE_DIR = path.join(os.homedir(), ".claude");
const PROJECTS_DIR = path.join(CLAUDE_DIR, "projects");

function cwdToProjectDir(cwd) {
  const resolved = path.resolve(cwd);
  const projectKey = resolved.replace(/[:\\/]+/g, "-");
  return projectKey.startsWith("-") ? projectKey : `-${projectKey}`;
}

function listSessionsForProject(cwd, projectsDir = PROJECTS_DIR) {
  const projectPath = path.join(projectsDir, cwdToProjectDir(cwd));
  if (!fs.existsSync(projectPath)) {
    return [];
  }

  return fs
    .readdirSync(projectPath, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".jsonl"))
    .map((entry) => {
      const sessionPath = path.join(projectPath, entry.name);
      return {
        id: entry.name.replace(/\.jsonl$/, ""),
        name: entry.name,
        path: sessionPath,
        mtimeMs: fs.statSync(sessionPath).mtimeMs,
      };
    })
    .sort((left, right) => right.mtimeMs - left.mtimeMs);
}

function findLatestSession(cwd, projectsDir = PROJECTS_DIR) {
  const sessions = listSessionsForProject(cwd, projectsDir);
  return sessions[0] || null;
}

function resolveSessionPath(selection, cwd, projectsDir = PROJECTS_DIR) {
  if (!selection) {
    const latest = findLatestSession(cwd, projectsDir);
    if (!latest) {
      return null;
    }
    return latest.path;
  }

  const looksLikePath =
    path.isAbsolute(selection) || selection.includes(path.sep) || selection.endsWith(".jsonl");

  if (looksLikePath) {
    const resolved = path.resolve(selection);
    return fs.existsSync(resolved) ? resolved : null;
  }

  const projectPath = path.join(projectsDir, cwdToProjectDir(cwd));
  const candidates = [selection, `${selection}.jsonl`];

  for (const candidate of candidates) {
    const candidatePath = path.join(projectPath, candidate);
    if (fs.existsSync(candidatePath)) {
      return candidatePath;
    }
  }

  return null;
}

function extractTextFromContent(content) {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";

  return content
    .filter((item) => item && (item.type === "text" || item.type === "input_text"))
    .map((item) => item.text || "")
    .join("\n")
    .trim();
}

function extractToolCalls(content) {
  if (!Array.isArray(content)) return [];

  return content
    .filter((item) => item && item.type === "tool_use")
    .map((item) => ({
      id: item.id || null,
      tool: item.name || "unknown",
      input: item.input || {},
    }));
}

function collectMessageCandidates(record) {
  const candidates = [];

  if ((record.type === "user" || record.type === "assistant") && record.message) {
    candidates.push({
      role: record.type,
      message: record.message,
      timestamp: record.timestamp,
    });
  }

  const nestedMessage = record.data?.message?.message;
  const nestedRole = nestedMessage?.role || record.data?.message?.type;
  const nestedTimestamp = record.data?.message?.timestamp || record.timestamp;

  if ((nestedRole === "user" || nestedRole === "assistant") && nestedMessage) {
    candidates.push({
      role: nestedRole,
      message: nestedMessage,
      timestamp: nestedTimestamp,
    });
  }

  return candidates;
}

function parseSession(sessionPath) {
  const raw = fs.readFileSync(sessionPath, "utf8");
  const lines = raw.split(/\r?\n/).filter(Boolean);
  const messages = [];
  const meta = {
    cwd: null,
    gitBranch: null,
    sessionId: path.basename(sessionPath, ".jsonl"),
  };

  for (const line of lines) {
    let record;
    try {
      record = JSON.parse(line);
    } catch {
      continue;
    }

    if (record.cwd) meta.cwd = record.cwd;
    if (record.gitBranch) meta.gitBranch = record.gitBranch;
    if (record.sessionId) meta.sessionId = record.sessionId;

    const candidates = collectMessageCandidates(record);
    for (const candidate of candidates) {
      const content = candidate.message?.content;
      const text = extractTextFromContent(content);
      const toolCalls = extractToolCalls(content);

      if (candidate.role === "user") {
        const hasToolResultOnly =
          Array.isArray(content) &&
          content.some((item) => item.type === "tool_result") &&
          !content.some((item) => item.type === "text" || item.type === "input_text");
        if (hasToolResultOnly) {
          continue;
        }
      }

      if (!text && toolCalls.length === 0) {
        continue;
      }

      messages.push({
        role: candidate.role,
        content: text,
        toolCalls,
        timestamp: candidate.timestamp || null,
      });
    }
  }

  return { messages, meta };
}

function extractFilePath(input) {
  return input?.file_path || input?.path || input?.target_file || input?.filePath || null;
}

function extractCommand(input) {
  return input?.command || input?.cmd || null;
}

function buildSessionContext({ messages, meta, cwd, sessionPath, gitContext }) {
  const filesModified = new Set();
  const filesRead = new Set();
  const commands = [];
  const transcript = [];

  for (const message of messages) {
    if (message.role === "assistant" && message.toolCalls.length > 0) {
      for (const toolCall of message.toolCalls) {
        const toolName = String(toolCall.tool || "").toLowerCase();
        const filePath = extractFilePath(toolCall.input);
        const command = extractCommand(toolCall.input);

        if (filePath && /(edit|write|create|multi_edit)/.test(toolName)) {
          filesModified.add(filePath);
        } else if (filePath && /(read|grep|glob|search)/.test(toolName)) {
          filesRead.add(filePath);
        }

        if (command && /(bash|command|run)/.test(toolName)) {
          commands.push(command);
        }
      }
    }

    const summaryParts = [];
    if (message.content) {
      summaryParts.push(message.content);
    }
    if (message.role === "assistant" && message.toolCalls.length > 0) {
      const toolSummary = message.toolCalls
        .map((toolCall) => {
          const filePath = extractFilePath(toolCall.input);
          const command = extractCommand(toolCall.input);
          if (filePath) return `${toolCall.tool} ${filePath}`;
          if (command) return `${toolCall.tool}: ${command}`;
          return toolCall.tool;
        })
        .join(", ");
      if (toolSummary) {
        summaryParts.push(`[tools] ${toolSummary}`);
      }
    }

    if (summaryParts.length > 0) {
      transcript.push({
        role: message.role,
        text: summaryParts.join(" | "),
        timestamp: message.timestamp || null,
      });
    }
  }

  return {
    cwd,
    sessionCwd: meta.cwd || cwd,
    sessionPath,
    sessionId: meta.sessionId || path.basename(sessionPath, ".jsonl"),
    branch: gitContext.branch || meta.gitBranch || null,
    transcript,
    filesModified: [...filesModified],
    filesRead: [...filesRead],
    commands,
    messages,
    gitContext,
  };
}

module.exports = {
  CLAUDE_DIR,
  PROJECTS_DIR,
  buildSessionContext,
  cwdToProjectDir,
  findLatestSession,
  listSessionsForProject,
  parseSession,
  resolveSessionPath,
};
