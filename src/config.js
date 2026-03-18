const fs = require("fs");
const os = require("os");
const path = require("path");

const CONFIG_PATH = path.join(os.homedir(), ".cc-continue.json");

function loadConfig(configPath = CONFIG_PATH) {
  try {
    return JSON.parse(fs.readFileSync(configPath, "utf8"));
  } catch {
    return {};
  }
}

function saveConfig(config, configPath = CONFIG_PATH) {
  fs.writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`, { mode: 0o600 });
  try {
    fs.chmodSync(configPath, 0o600);
  } catch {
    // Best effort. Some filesystems do not support chmod.
  }
}

function getProviderConfig(config, provider) {
  return config.providers?.[provider] || {};
}

function getApiKey({
  provider,
  cliValue,
  env = process.env,
  config = loadConfig(),
}) {
  if (cliValue) return cliValue;

  if (provider === "openrouter" && env.OPENROUTER_API_KEY) {
    return env.OPENROUTER_API_KEY;
  }

  const providerConfig = getProviderConfig(config, provider);
  return providerConfig.apiKey || config.openrouter_api_key || null;
}

function getDefaultModel({ provider, cliValue, config = loadConfig() }) {
  if (cliValue) return cliValue;

  const providerConfig = getProviderConfig(config, provider);
  return providerConfig.model || "openrouter/free";
}

function storeApiKey({ provider, apiKey, configPath = CONFIG_PATH }) {
  const config = loadConfig(configPath);
  config.providers = config.providers || {};
  config.providers[provider] = config.providers[provider] || {};
  config.providers[provider].apiKey = apiKey;

  if (provider === "openrouter") {
    delete config.openrouter_api_key;
  }

  saveConfig(config, configPath);
}

function promptForApiKey({
  provider,
  input = process.stdin,
  output = process.stderr,
}) {
  if (!input.isTTY || !output.isTTY) {
    return Promise.resolve(null);
  }

  const label = provider === "openrouter" ? "OpenRouter" : provider;
  const prompt = `Enter your ${label} API key: `;

  return new Promise((resolve, reject) => {
    let buffer = "";
    const previousRawMode = input.isRaw;

    function cleanup() {
      input.removeListener("data", onData);
      if (input.isTTY) {
        input.setRawMode(Boolean(previousRawMode));
      }
      input.pause();
    }

    function finish(value) {
      cleanup();
      output.write("\n");
      resolve(value.trim() || null);
    }

    function onData(chunk) {
      const text = chunk.toString("utf8");

      if (text === "\u0003") {
        cleanup();
        output.write("\n");
        const error = new Error("Prompt cancelled");
        error.exitCode = 130;
        reject(error);
        return;
      }

      if (text === "\r" || text === "\n") {
        finish(buffer);
        return;
      }

      if (text === "\u007f") {
        buffer = buffer.slice(0, -1);
        return;
      }

      if (text.startsWith("\u001b")) {
        return;
      }

      buffer += text;
    }

    output.write(prompt);
    input.setRawMode(true);
    input.resume();
    input.on("data", onData);
  });
}

module.exports = {
  CONFIG_PATH,
  getApiKey,
  getDefaultModel,
  loadConfig,
  promptForApiKey,
  saveConfig,
  storeApiKey,
};
