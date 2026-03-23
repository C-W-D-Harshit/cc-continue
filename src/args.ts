import path from "node:path";
import {
  SUPPORTED_COMMANDS,
  SUPPORTED_PROVIDERS,
  SUPPORTED_TARGETS,
  type PackageInfo,
  type ParsedOptions,
} from "./types.js";

function requireValue(flag: string, args: string[]): string {
  const value = args.shift();
  if (!value || value.startsWith("-")) {
    throw new Error(`Missing value for ${flag}`);
  }
  return value;
}

export function parseArgs(argv: string[]): ParsedOptions {
  const args = [...argv];
  const options: ParsedOptions = {
    command: "continue",
    raw: false,
    copy: false,
    help: false,
    version: false,
    session: null,
    model: null,
    provider: "openrouter",
    output: null,
    apiKey: null,
    target: "generic",
    limit: 10,
  };

  if (args[0] === "doctor" || args[0] === "sessions") {
    options.command = args[0];
    args.shift();
  }

  while (args.length > 0) {
    const arg = args.shift();

    switch (arg) {
      case "--help":
      case "-h":
        options.help = true;
        break;
      case "--version":
      case "-v":
        options.version = true;
        break;
      case "--raw":
        options.raw = true;
        break;
      case "--copy":
      case "-c":
        options.copy = true;
        break;
      case "--session":
        options.session = requireValue(arg, args);
        break;
      case "--model":
        options.model = requireValue(arg, args);
        break;
      case "--provider":
        options.provider = requireValue(arg, args) as ParsedOptions["provider"];
        break;
      case "--output":
      case "-o":
        options.output = path.resolve(requireValue(arg, args));
        break;
      case "--api-key":
        options.apiKey = requireValue(arg, args);
        break;
      case "--target":
        options.target = requireValue(arg, args) as ParsedOptions["target"];
        break;
      case "--limit":
      case "-n":
        options.limit = Number(requireValue(arg, args));
        break;
      default:
        if (!arg) {
          break;
        }
        if (arg.startsWith("-")) {
          throw new Error(`Unknown flag: ${arg}`);
        }
        if (!options.session) {
          options.session = arg;
          break;
        }
        throw new Error(`Unexpected argument: ${arg}`);
    }
  }

  if (!SUPPORTED_PROVIDERS.includes(options.provider)) {
    throw new Error(
      `Unsupported provider "${options.provider}". Supported providers: ${SUPPORTED_PROVIDERS.join(", ")}`
    );
  }

  if (!SUPPORTED_TARGETS.includes(options.target)) {
    throw new Error(
      `Unsupported target "${options.target}". Supported targets: ${SUPPORTED_TARGETS.join(", ")}`
    );
  }

  if (!SUPPORTED_COMMANDS.includes(options.command)) {
    throw new Error(
      `Unsupported command "${options.command}". Supported commands: ${SUPPORTED_COMMANDS.join(", ")}`
    );
  }

  if (!Number.isInteger(options.limit) || options.limit <= 0) {
    throw new Error(`Invalid limit "${options.limit}". Expected a positive integer.`);
  }

  return options;
}

export function getHelpText({ name, version }: PackageInfo): string {
  return [
    `${name} ${version}`,
    "",
    "Turn Claude Code sessions into high-quality continuation prompts for Codex, Cursor, ChatGPT, or any other agent.",
    "",
    "Usage",
    `  ${name} [options]`,
    `  ${name} doctor [options]`,
    `  ${name} sessions [options]`,
    "",
    "Core Options",
    "  -h, --help              Show help",
    "  -v, --version           Show version",
    "      --raw               Skip provider refinement and output the structured raw prompt",
    "  -c, --copy              Copy the final prompt to the clipboard",
    "  -o, --output <file>     Write the final prompt to a file",
    "      --session <id|path> Use a specific session file or session id",
    "  -n, --limit <count>     Limit rows for the sessions command (default: 10)",
    "",
    "Refinement",
    "      --provider <name>   Refinement provider (default: openrouter)",
    "      --model <name>      Provider model override (default: openrouter/free)",
    "      --api-key <key>     Provider API key override",
    "      --target <name>     Prompt target: generic, codex, cursor, chatgpt",
    "",
    "Doctor",
    "  Verifies Claude session discovery, git context, clipboard support, and API key availability.",
    "",
    "Sessions",
    "  Lists recent Claude session files for the current project.",
    "",
    "Examples",
    `  ${name}`,
    `  ${name} --raw --copy --target codex`,
    `  ${name} --session 4474da94-50a9-40de-9afe-c6c73acf2401 --model openrouter/free`,
    `  ${name} --output ./handoff.md`,
    `  ${name} doctor`,
    `  ${name} sessions --limit 5`,
  ].join("\n");
}
