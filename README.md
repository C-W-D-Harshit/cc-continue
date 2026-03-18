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

That's it. It reads your Claude Code session, captures the current git state, and produces a continuation prompt that is structured enough for another agent to take over quickly.

## Product Features

- Finds the latest Claude session for the current project, or lets you pick a specific session with `--session`
- Lists recent project sessions with `cc-continue sessions`
- Captures `git status`, staged diff, unstaged diff, and untracked file previews
- Produces raw or provider-refined prompts
- Supports target-specific prompts with `--target codex|cursor|chatgpt|generic`
- Includes a `doctor` command for session discovery, git, clipboard, and API-key diagnostics
- Shows generation summaries, better progress feedback, and clearer fallback behavior
- Copies to the clipboard on macOS, Linux, and Windows when a supported utility is available
- Stores API keys with stricter local file permissions

## How It Works

1. Maps your current directory to Claude Code's session storage (`~/.claude/projects/`)
2. Finds the most recent session `.jsonl` file
3. Parses the conversation, including nested progress events and tool calls
4. Captures the current repository state: status, diffs, and untracked files
5. Either outputs a structured raw prompt or sends a budgeted context dump to **OpenRouter**
6. Prints to stdout and can also write to a file or copy to the clipboard

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

# Generate a refined handoff prompt (uses OpenRouter)
cc-continue

# Skip OpenRouter, output a structured raw prompt
cc-continue --raw

# Target Codex specifically
cc-continue --target codex

# Pick a specific session
cc-continue --session 4474da94-50a9-40de-9afe-c6c73acf2401

# List recent sessions for this project
cc-continue sessions --limit 5

# Write to a file
cc-continue --output ./handoff.md

# Copy to clipboard
cc-continue -c

# Run diagnostics
cc-continue doctor
```

### First Run

On first run in refined mode, it'll ask for your OpenRouter API key:

```
Enter your OpenRouter API key: sk-or-v1-...
Saved to ~/.cc-continue.json
```

Get a free key at [openrouter.ai/keys](https://openrouter.ai/keys). The key is saved locally and reused for future runs.

You can also set it via environment variable:

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

- `--raw` Skip provider refinement and emit the structured raw prompt
- `--copy` Copy the generated prompt to the clipboard
- `--output <file>` Write the generated prompt to a file
- `--session <id|path>` Use a specific Claude session
- `--limit <count>` Limit rows for `cc-continue sessions`
- `--provider <name>` Refinement provider, currently `openrouter`
- `--model <name>` Override the provider model, default `openrouter/free`
- `--api-key <key>` Override the API key for a single run
- `--target <name>` Tailor the prompt for `generic`, `codex`, `cursor`, or `chatgpt`

## Sessions

Run:

```bash
cc-continue sessions
```

Use this before `--session` when you want to verify which Claude run you are continuing.

## What the Output Looks Like

Instead of a raw dump of tool calls, you get something like:

```
## Context
Working on social media preview components in a React app on branch `main`.

## What Was Requested
Fix minor issues with Instagram gradient ring, raw markdown showing in previews,
and non-functional "more" buttons.

## What Was Completed
- Replaced Tailwind gradient classes with inline style for Instagram story ring
- Added stripMarkdown() utility for clean text in all three previews
- Wired up useState for expand/collapse in LinkedIn and Instagram previews

## Files Modified
- apps/web/src/routes/posts/$id.tsx

## What Remains
Verify all three fixes work correctly. Check for any remaining visual issues.
```

## How It Finds Your Session

Claude Code stores sessions at:

```
~/.claude/projects/<project-path>/<session-id>.jsonl
```

Where `<project-path>` is your working directory with path separators replaced by `-`. `cc-continue` finds the most recently modified top-level `.jsonl` file for your current directory.

## Requirements

- **Node.js** >= 18
- **Claude Code** (must have been used in the current directory at least once)
- **OpenRouter API key** (optional if using `--raw`)

## Doctor

Run:

```bash
cc-continue doctor
```

This checks:

- Whether Claude session storage exists
- Whether the current project has Claude session files
- Whether the current directory is a git repository
- Whether a provider API key is available
- Whether clipboard support is available on the current OS

## License

MIT
