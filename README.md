# cc-continue

Hit the Claude Code usage limit mid-task? `cc-continue` turns the latest Claude session in your current project into a continuation prompt you can paste into **Codex**, **Cursor**, **ChatGPT**, or any other AI agent to keep going.

## The Problem

You're deep in a Claude Code session — it's editing files, running commands, making progress — and then:

> **Usage limit reached. Please wait before sending more messages.**

Your work is half-done. You can't continue. You switch to another AI agent but now you have to explain everything from scratch.

## The Solution

```bash
npx cc-continue
```

That's it. It reads your Claude Code session, captures the current git state, and produces a structured continuation prompt that another agent can pick up immediately.

## Features

- Finds the latest Claude session for the current project, or pick one with `--session`
- Filters noise from user messages (confirmations, short replies, interruptions)
- Tracks only **unresolved** errors — skips errors that were later fixed
- Captures recent commits, committed diffs, staged/unstaged changes, and untracked files
- Extracts key decisions and pivots from the previous agent
- Produces a priority-ordered prompt: Task → Errors → Decisions → Completed Work → Current State → Instructions
- Supports target-specific prompts with `--target codex|cursor|chatgpt|generic`
- Auto-copies to clipboard on macOS, Linux, and Windows
- Optional LLM refinement via `--refine` (uses OpenRouter)
- Lists recent project sessions with `cc-continue sessions`
- `doctor` command for diagnostics

## How It Works

1. Maps your current directory to Claude Code's session storage (`~/.claude/projects/`)
2. Finds the most recent session `.jsonl` file
3. Parses the conversation — user messages, tool calls, errors, and results
4. Captures the current git state: branch, commits, diffs, untracked files
5. Builds a structured prompt optimized for agent handoff
6. Copies to clipboard and prints to stdout

## Install

```bash
# Run directly (no install needed)
npx cc-continue

# Or install globally
npm i -g cc-continue
```

## Usage

```bash
# cd into the project where Claude Code was running
cd my-project

# Generate a continuation prompt (auto-copies to clipboard)
cc-continue

# Target Codex specifically
cc-continue --target codex

# Pick a specific session
cc-continue --session 4474da94-50a9-40de-9afe-c6c73acf2401

# Refine via OpenRouter LLM (optional)
cc-continue --refine

# List recent sessions for this project
cc-continue sessions --limit 5

# Write to a file
cc-continue --output ./handoff.md

# Run diagnostics
cc-continue doctor
```

### LLM Refinement (Optional)

If you want the prompt refined by an LLM, use `--refine`. On first use, it'll ask for your OpenRouter API key:

```
Enter your OpenRouter API key: sk-or-v1-...
Saved to ~/.cc-continue.json
```

Get a free key at [openrouter.ai/keys](https://openrouter.ai/keys). You can also set it via environment variable:

```bash
export OPENROUTER_API_KEY=sk-or-v1-...
```

## Commands

```bash
cc-continue [options]
cc-continue doctor
cc-continue sessions
```

### Key Flags

- `--target <name>` Tailor the prompt for `generic`, `codex`, `cursor`, or `chatgpt`
- `--output <file>` Write the prompt to a file
- `--session <id|path>` Use a specific Claude session
- `--limit <count>` Limit rows for `cc-continue sessions`
- `--refine` Refine the prompt via an LLM provider (default: raw mode)
- `--provider <name>` Refinement provider (default: `openrouter`)
- `--model <name>` Override the provider model (default: `openrouter/free`)
- `--api-key <key>` Override the API key for a single run

## Sessions

```bash
cc-continue sessions
```

Use this before `--session` when you want to verify which Claude run you are continuing.

## How It Finds Your Session

Claude Code stores sessions at:

```
~/.claude/projects/<project-path>/<session-id>.jsonl
```

Where `<project-path>` is your working directory with path separators replaced by `-`. `cc-continue` finds the most recently modified top-level `.jsonl` file for your current directory.

## Requirements

- **Node.js** >= 18
- **Claude Code** (must have been used in the current directory at least once)
- **OpenRouter API key** (only needed with `--refine`)

## Doctor

```bash
cc-continue doctor
```

Checks session storage, project sessions, git repo, API key availability, and clipboard support.

## License

MIT
