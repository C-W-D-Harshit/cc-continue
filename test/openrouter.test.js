const test = require("node:test");
const assert = require("node:assert/strict");
const { buildOpenRouterPayload, classifyOpenRouterError } = require("../src/openrouter");

test("buildOpenRouterPayload disables reasoning by default", () => {
  const payload = buildOpenRouterPayload({
    model: "openrouter/free",
    systemPrompt: "system",
    userPrompt: "user",
  });

  assert.equal(payload.reasoning.effort, "none");
  assert.equal(payload.messages.length, 2);
});

test("classifyOpenRouterError detects privacy policy guardrail failures", () => {
  const result = classifyOpenRouterError({
    statusCode: 404,
    body: JSON.stringify({
      error: {
        message:
          "No endpoints available matching your guardrail restrictions and data policy. Configure: https://openrouter.ai/settings/privacy",
      },
    }),
  });

  assert.equal(result.category, "privacy-policy");
  assert.match(result.message, /privacy settings/i);
  assert.ok(result.suggestions.some((entry) => entry.includes("settings/privacy")));
});
