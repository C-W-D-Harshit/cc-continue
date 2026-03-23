import { spawnSync } from "node:child_process";
import type { ClipboardResult, ClipboardStrategy } from "./types.js";

function hasCommand(command: string): boolean {
  const probe = spawnSync("which", [command], { stdio: "ignore" });
  return probe.status === 0;
}

export function getClipboardStrategy(): ClipboardStrategy | null {
  if (process.platform === "darwin") {
    return { command: "pbcopy", args: [] };
  }

  if (process.platform === "win32") {
    return { command: "cmd", args: ["/c", "clip"] };
  }

  if (hasCommand("wl-copy")) {
    return { command: "wl-copy", args: [] };
  }

  if (hasCommand("xclip")) {
    return { command: "xclip", args: ["-selection", "clipboard"] };
  }

  if (hasCommand("xsel")) {
    return { command: "xsel", args: ["--clipboard", "--input"] };
  }

  return null;
}

export function copyToClipboard(text: string): ClipboardResult {
  const strategy = getClipboardStrategy();
  if (!strategy) {
    return { ok: false, error: "No supported clipboard utility found" };
  }

  const result = spawnSync(strategy.command, strategy.args, {
    input: text,
    encoding: "utf8",
  });

  if (result.status !== 0) {
    return {
      ok: false,
      error: (result.stderr || "Clipboard command failed").trim(),
    };
  }

  return { ok: true, command: strategy.command };
}
