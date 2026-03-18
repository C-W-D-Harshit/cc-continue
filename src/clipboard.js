const { spawnSync } = require("child_process");

function hasCommand(command) {
  const probe = spawnSync("which", [command], { stdio: "ignore" });
  return probe.status === 0;
}

function getClipboardStrategy() {
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

function copyToClipboard(text) {
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

module.exports = {
  copyToClipboard,
  getClipboardStrategy,
};
