export const SUPPORTED_COMMANDS = ["continue", "doctor", "sessions"] as const;
export const SUPPORTED_PROVIDERS = ["openrouter"] as const;
export const SUPPORTED_TARGETS = ["generic", "codex", "cursor", "chatgpt"] as const;

export type Command = (typeof SUPPORTED_COMMANDS)[number];
export type Provider = (typeof SUPPORTED_PROVIDERS)[number];
export type Target = (typeof SUPPORTED_TARGETS)[number];

export interface ParsedOptions {
  command: Command;
  raw: boolean;
  copy: boolean;
  help: boolean;
  version: boolean;
  session: string | null;
  model: string | null;
  provider: Provider;
  output: string | null;
  apiKey: string | null;
  target: Target;
  limit: number;
}

export interface PackageInfo {
  name: string;
  version: string;
}

export interface ProviderConfig {
  apiKey?: string;
  model?: string;
}

export interface AppConfig {
  providers?: Partial<Record<Provider, ProviderConfig>>;
  openrouter_api_key?: string;
}

export interface ClipboardStrategy {
  command: string;
  args: string[];
}

export interface ClipboardResult {
  ok: boolean;
  command?: string;
  error?: string;
}

export interface GitDiffSection {
  stat: string;
  diff: string;
}

export interface UntrackedFile {
  path: string;
  preview: string | null;
}

export interface GitContext {
  isGitRepo: boolean;
  branch: string | null;
  status: string;
  staged: GitDiffSection;
  unstaged: GitDiffSection;
  untracked: UntrackedFile[];
  hasChanges: boolean;
}

export interface ToolCall {
  id: string | null;
  tool: string;
  input: Record<string, unknown>;
}

export interface SessionMessage {
  role: "user" | "assistant";
  content: string;
  toolCalls: ToolCall[];
  timestamp: string | null;
}

export interface SessionMeta {
  cwd: string | null;
  gitBranch: string | null;
  sessionId: string;
}

export interface SessionRecord {
  id: string;
  name: string;
  path: string;
  mtimeMs: number;
}

export interface TranscriptEntry {
  role: SessionMessage["role"];
  text: string;
  timestamp: string | null;
}

export interface SessionContext {
  cwd: string;
  sessionCwd: string;
  sessionPath: string;
  sessionId: string;
  branch: string | null;
  transcript: TranscriptEntry[];
  filesModified: string[];
  filesRead: string[];
  commands: string[];
  messages: SessionMessage[];
  gitContext: GitContext;
}

export interface DoctorCheck {
  status: "OK" | "WARN";
  label: string;
  detail: string;
}

export interface DoctorReport {
  checks: DoctorCheck[];
  notes: string[];
  nextSteps: string[];
}

export interface ConfidenceReport {
  sessionId: string;
  messageCount: number;
  filesModified: number;
  filesRead: number;
  commandsCaptured: number;
  caveats: string[];
}

export interface OpenRouterPayload {
  model: string;
  reasoning: {
    effort: "none";
  };
  messages: Array<{
    role: "system" | "user";
    content: string;
  }>;
}

export interface OpenRouterErrorDetails {
  category: "network" | "privacy-policy" | "auth" | "not-found" | "rate-limit" | "provider";
  message: string;
  suggestions: string[];
  raw?: string;
}

export interface OpenRouterRefinementSuccess {
  ok: true;
  text: string;
}

export interface OpenRouterRefinementFailure {
  ok: false;
  error: string;
  category?: OpenRouterErrorDetails["category"];
  suggestions?: string[];
  rawError?: string;
}

export type OpenRouterRefinementResult =
  | OpenRouterRefinementSuccess
  | OpenRouterRefinementFailure;

export interface AppError extends Error {
  exitCode?: number;
  suggestions?: string[];
}
