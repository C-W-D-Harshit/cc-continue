const https = require("https");

function parseJsonSafely(value) {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function classifyOpenRouterError({ statusCode, body, requestError }) {
  if (requestError) {
    return {
      category: "network",
      message: requestError,
      suggestions: [
        "Check your network connection and try again.",
        "Run `cc-continue --raw` if you want to skip refinement.",
      ],
    };
  }

  const parsed = parseJsonSafely(body);
  const providerMessage =
    parsed?.error?.message || parsed?.message || (body ? String(body).slice(0, 500) : "Unknown provider error");
  const lower = providerMessage.toLowerCase();

  if (
    statusCode === 404 &&
    lower.includes("guardrail restrictions") &&
    lower.includes("data policy")
  ) {
    return {
      category: "privacy-policy",
      message:
        "OpenRouter blocked this model because your privacy settings do not allow any available endpoint for it.",
      suggestions: [
        "Open https://openrouter.ai/settings/privacy and relax the privacy restriction for this model.",
        "Retry with `cc-continue --raw` if you want to skip provider refinement.",
        "Retry with `cc-continue --model <another-openrouter-model>` if you have another allowed model.",
      ],
      raw: providerMessage,
    };
  }

  if (statusCode === 401 || statusCode === 403) {
    return {
      category: "auth",
      message: "OpenRouter rejected the request. Check that your API key is valid and allowed to use this model.",
      suggestions: [
        "Verify `OPENROUTER_API_KEY` or rerun interactively to save a fresh key.",
        "Retry with `cc-continue --raw` if you want to skip refinement.",
      ],
      raw: providerMessage,
    };
  }

  if (statusCode === 404) {
    return {
      category: "not-found",
      message: "OpenRouter could not find a compatible endpoint for this request.",
      suggestions: [
        "Retry with `cc-continue --model <another-openrouter-model>`.",
        "Run `cc-continue --raw` if you want to skip provider refinement.",
      ],
      raw: providerMessage,
    };
  }

  if (statusCode === 429) {
    return {
      category: "rate-limit",
      message: "OpenRouter rate limited this request.",
      suggestions: [
        "Wait a bit and retry.",
        "Run `cc-continue --raw` if you want to skip refinement.",
      ],
      raw: providerMessage,
    };
  }

  return {
    category: "provider",
    message: statusCode ? `OpenRouter error ${statusCode}: ${providerMessage}` : providerMessage,
    suggestions: [
      "Retry with `cc-continue --raw` if you want to skip refinement.",
    ],
    raw: providerMessage,
  };
}

async function refineWithOpenRouter({
  apiKey,
  model,
  systemPrompt,
  userPrompt,
  timeoutMs = 60000,
  onStatus,
}) {
  const body = JSON.stringify({
    model,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
  });

  return new Promise((resolve) => {
    let receivedFirstChunk = false;
    const req = https.request(
      {
        hostname: "openrouter.ai",
        path: "/api/v1/chat/completions",
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(body),
          Authorization: `Bearer ${apiKey}`,
        },
      },
      (res) => {
        onStatus?.(`provider responded (${res.statusCode || "unknown"})`);
        let data = "";
        res.on("data", (chunk) => {
          if (!receivedFirstChunk) {
            receivedFirstChunk = true;
            onStatus?.("receiving response");
          }
          data += chunk;
        });
        res.on("end", () => {
          onStatus?.("finalizing response");
          if (res.statusCode && res.statusCode >= 400) {
            const classified = classifyOpenRouterError({
              statusCode: res.statusCode,
              body: data,
            });
            resolve({
              ok: false,
              error: classified.message,
              category: classified.category,
              suggestions: classified.suggestions,
              rawError: classified.raw || data.slice(0, 500),
            });
            return;
          }

          try {
            const json = JSON.parse(data);
            if (json.error) {
              const classified = classifyOpenRouterError({
                statusCode: res.statusCode,
                body: data,
              });
              resolve({
                ok: false,
                error: classified.message,
                category: classified.category,
                suggestions: classified.suggestions,
                rawError: classified.raw || (json.error.message || JSON.stringify(json.error)),
              });
              return;
            }

            const text = json.choices?.[0]?.message?.content;
            resolve(text ? { ok: true, text } : { ok: false, error: "Empty response" });
          } catch {
            resolve({
              ok: false,
              error: `Unable to parse provider response: ${data.slice(0, 500)}`,
            });
          }
        });
      }
    );

    onStatus?.("sending request");

    req.on("socket", () => {
      onStatus?.("waiting for provider");
    });

    req.setTimeout(timeoutMs, () => {
      onStatus?.("request timed out");
      req.destroy(new Error("Provider request timed out"));
    });

    req.on("error", (error) => {
      const classified = classifyOpenRouterError({ requestError: error.message });
      resolve({
        ok: false,
        error: classified.message,
        category: classified.category,
        suggestions: classified.suggestions,
        rawError: error.message,
      });
    });

    req.write(body);
    req.end();
  });
}

module.exports = {
  classifyOpenRouterError,
  refineWithOpenRouter,
};
