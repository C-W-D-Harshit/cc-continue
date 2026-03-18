# Contributing to cc-continue

Thanks for your interest in contributing!

## Getting Started

1. Fork the repo
2. Clone your fork:
   ```bash
   git clone git@github.com:YOUR_USERNAME/cc-continue.git
   cd cc-continue
   ```
3. Link it locally for testing:
   ```bash
   npm link
   ```
4. Make your changes
5. Test by running `cc-continue` in a project directory where you've used Claude Code

## Development

This is a zero-dependency CLI tool built on Node.js built-ins. Keep it dependency-free unless there is a strong reason not to.

### Project Structure

```
index.js              # CLI entrypoint
src/                  # Internal modules
test/                 # Node test suite + fixtures
package.json
README.md
LICENSE
```

### Testing Your Changes

```bash
# Run the automated test suite
npm test

# Smoke test the CLI help
npm run smoke:help

# Check environment diagnostics
cc-continue doctor

# Inspect local sessions for the current project
cc-continue sessions
```

## Guidelines

- **Zero dependencies** — everything should use Node.js built-ins
- **Don't break `--raw`** — the raw fallback must always work without a network call
- **Keep fixtures realistic** — parser changes should be backed by JSONL fixtures from real Claude session shapes
- **Preserve CLI ergonomics** — help text, error messages, and diagnostics are part of the product

## Submitting a PR

1. Create a branch: `git checkout -b my-feature`
2. Make your changes
3. Run `npm test`
4. Smoke test `cc-continue --raw` in a real Claude project if your change touches parsing or prompt generation
4. Push and open a PR

## Ideas for Contributions

- Additional provider adapters beyond OpenRouter
- Session browsing and selection UX
- Support for other session formats (Cursor, Windsurf, etc.)
- Better large-session summarization strategies
- JSON output modes for other automation workflows

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
