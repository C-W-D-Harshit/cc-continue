const fs = require("fs");
const path = require("path");
const packageJson = require("../package.json");
const { getHelpText, parseArgs } = require("./args");
const {
  CONFIG_PATH,
  getApiKey,
  getDefaultModel,
  loadConfig,
  promptForApiKey,
  storeApiKey,
} = require("./config");
const { copyToClipboard } = require("./clipboard");
const { runDoctor } = require("./doctor");
const { getGitContext } = require("./git");
const {
  buildRefinementDump,
  buildRefinementSystemPrompt,
  buildRawPrompt,
} = require("./prompt");
const { refineWithOpenRouter } = require("./openrouter");
const { buildSessionContext, listSessionsForProject, parseSession, resolveSessionPath } = require("./session");
const { createTheme, formatDoctorReport, formatRunSummary, formatSessionsReport } = require("./ui");

function fail(message, { exitCode = 1, suggestions = [] } = {}) {
  const error = new Error(message);
  error.exitCode = exitCode;
  error.suggestions = suggestions;
  throw error;
}

function createActivityReporter(label) {
  const stream = process.stderr;
  const start = Date.now();
  let status = "starting";
  let timer = null;
  let lastRendered = "";
  const frames = ["|", "/", "-", "\\"];
  let frameIndex = 0;

  function elapsedSeconds() {
    return Math.max(1, Math.round((Date.now() - start) / 1000));
  }

  function render() {
    const line = `${frames[frameIndex]} ${label}: ${status} (${elapsedSeconds()}s)`;
    frameIndex = (frameIndex + 1) % frames.length;

    if (stream.isTTY) {
      const padded = line.padEnd(Math.max(lastRendered.length, line.length), " ");
      stream.write(`\r${padded}`);
      lastRendered = padded;
      return;
    }

    if (elapsedSeconds() === 1 || elapsedSeconds() % 5 === 0) {
      stream.write(`${line}\n`);
    }
  }

  function startTimer() {
    render();
    timer = setInterval(render, 1000);
    if (typeof timer.unref === "function") {
      timer.unref();
    }
  }

  function update(nextStatus) {
    status = nextStatus;
    if (stream.isTTY) {
      render();
    }
  }

  function stop(finalStatus) {
    if (timer) {
      clearInterval(timer);
    }
    const message = `${label}: ${finalStatus} (${elapsedSeconds()}s)`;
    if (stream.isTTY) {
      const padded = message.padEnd(Math.max(lastRendered.length, message.length), " ");
      stream.write(`\r${padded}\n`);
    } else {
      stream.write(`${message}\n`);
    }
  }

  startTimer();

  return { update, stop };
}

function writeOutputFile(outputPath, text) {
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `${text}\n`);
}

async function main(argv = process.argv.slice(2)) {
  const options = parseArgs(argv);
  const pkgInfo = { name: packageJson.name, version: packageJson.version };
  const ui = createTheme(process.stderr);

  if (options.help) {
    process.stdout.write(`${getHelpText(pkgInfo)}\n`);
    return;
  }

  if (options.version) {
    process.stdout.write(`${packageJson.version}\n`);
    return;
  }

  const cwd = process.cwd();
  const config = loadConfig();

  if (options.command === "doctor") {
    const report = runDoctor({
      cwd,
      provider: options.provider,
      cliApiKey: options.apiKey,
      env: process.env,
      config,
    });
    process.stdout.write(`${formatDoctorReport(report)}\n`);
    return;
  }

  if (options.command === "sessions") {
    const sessions = listSessionsForProject(cwd);
    process.stdout.write(`${formatSessionsReport({ cwd, sessions, limit: options.limit })}\n`);
    return;
  }

  ui.step("Finding Claude session");
  const sessionPath = resolveSessionPath(options.session, cwd);
  if (!sessionPath) {
    fail(
      options.session
        ? `Unable to find session "${options.session}" for ${cwd}`
        : `No Claude session files found for ${cwd}.`,
      {
        suggestions: [
          "Run `cc-continue sessions` to inspect project sessions.",
          "Run `cc-continue doctor` for diagnostics.",
          "Run Claude Code in this project at least once if no sessions exist yet.",
        ],
      }
    );
  }
  ui.success(`Using session ${path.basename(sessionPath)}`);

  ui.step("Parsing session");
  const { messages, meta } = parseSession(sessionPath);
  if (messages.length === 0) {
    fail(`Parsed zero usable messages from ${sessionPath}`);
  }

  ui.step("Capturing git context");
  const gitContext = getGitContext(cwd);
  const ctx = buildSessionContext({
    messages,
    meta,
    cwd,
    sessionPath,
    gitContext,
  });

  let finalPrompt = "";
  let mode = "raw";
  let activeModel = null;

  if (options.raw) {
    ui.step("Building raw continuation prompt");
    finalPrompt = buildRawPrompt(ctx, { target: options.target });
  } else {
    const provider = options.provider;
    let apiKey = getApiKey({
      provider,
      cliValue: options.apiKey,
      env: process.env,
      config,
    });
    const model = getDefaultModel({
      provider,
      cliValue: options.model,
      config,
    });
    activeModel = model;

    if (!apiKey) {
      ui.warn(`No ${provider} API key found. A key can be saved to ${CONFIG_PATH}.`);
      apiKey = await promptForApiKey({ provider });
      if (apiKey) {
        storeApiKey({ provider, apiKey });
        ui.success(`Saved ${provider} API key to ${CONFIG_PATH}`);
      }
    }

    if (!apiKey) {
      ui.warn("No API key available. Falling back to raw continuation prompt.");
      finalPrompt = buildRawPrompt(ctx, { target: options.target });
    } else {
      mode = "refined";
      ui.section(formatRunSummary({ ctx, options, mode, model }));
      ui.plain();
      ui.step(`Refining prompt with ${provider} (${model})`);
      ui.note("Free models can take a bit. Live status appears below.");
      const reporter = createActivityReporter("Refining prompt");
      const refined = await refineWithOpenRouter({
        apiKey,
        model,
        systemPrompt: buildRefinementSystemPrompt(options.target),
        userPrompt: buildRefinementDump(ctx, { target: options.target }),
        onStatus: (status) => reporter.update(status),
      });
      reporter.stop(refined.ok ? "done" : "failed");

      if (refined.ok) {
        finalPrompt = refined.text;
      } else {
        mode = "raw";
        ui.warn(`Provider refinement failed: ${refined.error}`);
        if (Array.isArray(refined.suggestions)) {
          for (const suggestion of refined.suggestions) {
            ui.note(suggestion);
          }
        }
        if (refined.rawError && refined.rawError !== refined.error) {
          ui.note(`Provider detail: ${refined.rawError}`);
        }
        ui.note("Falling back to the raw structured prompt.");
        finalPrompt = buildRawPrompt(ctx, { target: options.target });
      }
    }
  }

  if (mode === "raw") {
    ui.section(formatRunSummary({ ctx, options, mode, model: activeModel }));
    ui.plain();
  }

  if (options.output) {
    writeOutputFile(options.output, finalPrompt);
    ui.success(`Wrote prompt to ${options.output}`);
  }

  if (options.copy) {
    const clipboard = copyToClipboard(finalPrompt);
    if (clipboard.ok) {
      ui.success(`Copied prompt to clipboard via ${clipboard.command}`);
    } else {
      ui.warn(`Clipboard copy failed: ${clipboard.error}`);
    }
  }

  ui.success(`Prompt ready (${finalPrompt.length} chars)`);
  process.stdout.write(`${finalPrompt}\n`);
}

module.exports = {
  main,
};
