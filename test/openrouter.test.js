const test = require("node:test");
const assert = require("node:assert/strict");
const { classifyOpenRouterError } = require("../src/openrouter");

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
