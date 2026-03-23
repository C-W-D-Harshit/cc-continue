import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { GitContext, SessionContext, SessionMessage, SessionMeta, SessionRecord, ToolCall } from "./types.js";

export const CLAUDE_DIR = path.join(os.homedir(), ".claude");
export const PROJECTS_DIR = path.join(CLAUDE_DIR, "projects");

interface SessionContentItem {
  type?: string;
  text?: string;
  id?: string;
  name?: string;
  input?: Record<string, unknown>;
  content?: unknown;
}

interface SessionRecordJson {
  type?: string;
  cwd?: string;
  gitBranch?: string;
  sessionId?: string;
  timestamp?: string;
  message?: {
    role?: "user" | "assistant";
    content?: string | SessionContentItem[];
  };
  data?: {
    message?: {
      type?: "user" | "assistant";
      timestamp?: string;
      message?: {
        role?: "user" | "assistant";
        content?: string | SessionContentItem[];
      };
    };
  };
}

export function cwdToProjectDir(cwd: string): string {
  const resolved = path.resolve(cwd);
  const projectKey = resolved.replace(/[:\\/]+/g, "-");
  return projectKey.startsWith("-") ? projectKey : `-${projectKey}`;
}

export function listSessionsForProject(cwd: string, projectsDir: string = PROJECTS_DIR): SessionRecord[] {
  const projectPath = path.join(projectsDir, cwdToProjectDir(cwd));
  if (!fs.existsSync(projectPath)) {
    return [];
  }

  return fs
    .readdirSync(projectPath, { withFileTypes: true })
    .filter((entry: fs.Dirent) => entry.isFile() && entry.name.endsWith(".jsonl"))
    .map((entry: fs.Dirent) => {
      const sessionPath = path.join(projectPath, entry.name);
      return {
        id: entry.name.replace(/\.jsonl$/, ""),
        name: entry.name,
        path: sessionPath,
        mtimeMs: fs.statSync(sessionPath).mtimeMs,
      };
    })
    .sort((left: SessionRecord, right: SessionRecord) => right.mtimeMs - left.mtimeMs);
}

export function findLatestSession(cwd: string, projectsDir: string = PROJECTS_DIR): SessionRecord | null {
  const sessions = listSessionsForProject(cwd, projectsDir);
  return sessions[0] || null;
}

export function resolveSessionPath(
  selection: string | null,
  cwd: string,
  projectsDir: string = PROJECTS_DIR
): string | null {
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

function extractTextFromContent(content: string | SessionContentItem[] | undefined): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";

  return content
    .filter((item) => item && (item.type === "text" || item.type === "input_text"))
    .map((item) => item.text || "")
    .join("\n")
    .trim();
}

function extractToolCalls(content: string | SessionContentItem[] | undefined): ToolCall[] {
  if (!Array.isArray(content)) return [];

  return content
    .filter((item) => item && item.type === "tool_use")
    .map((item) => ({
      id: item.id || null,
      tool: item.name || "unknown",
      input: item.input || {},
    }));
}

function collectMessageCandidates(record: SessionRecordJson) {
  const candidates: Array<{
    role: "user" | "assistant";
    message: NonNullable<SessionRecordJson["message"]>;
    timestamp: string | undefined;
  }> = [];

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

export function parseSession(sessionPath: string): { messages: SessionMessage[]; meta: SessionMeta } {
  const raw = fs.readFileSync(sessionPath, "utf8");
  const lines = raw.split(/\r?\n/).filter(Boolean);
  const messages: SessionMessage[] = [];
  const meta: SessionMeta = {
    cwd: null,
    gitBranch: null,
    sessionId: path.basename(sessionPath, ".jsonl"),
  };

  for (const line of lines) {
    let record: SessionRecordJson;
    try {
      record = JSON.parse(line) as SessionRecordJson;
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

function extractFilePath(input: Record<string, unknown>): string | null {
  const value = input.file_path || input.path || input.target_file || input.filePath;
  return typeof value === "string" ? value : null;
}

function extractCommand(input: Record<string, unknown>): string | null {
  const value = input.command || input.cmd;
  return typeof value === "string" ? value : null;
}

export function buildSessionContext({
  messages,
  meta,
  cwd,
  sessionPath,
  gitContext,
}: {
  messages: SessionMessage[];
  meta: SessionMeta;
  cwd: string;
  sessionPath: string;
  gitContext: GitContext;
}): SessionContext {
  const filesModified = new Set<string>();
  const filesRead = new Set<string>();
  const commands: string[] = [];
  const transcript: SessionContext["transcript"] = [];

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

    const summaryParts: string[] = [];
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
