import assert from "node:assert/strict";
import test from "node:test";
import { buildOpenRouterPayload, classifyOpenRouterError } from "../src/openrouter.js";

test("buildOpenRouterPayload builds correct message structure", () => {
  const payload = buildOpenRouterPayload({
    model: "openrouter/free",
    systemPrompt: "system",
    userPrompt: "user",
  });

  assert.equal(payload.messages.length, 2);
  assert.equal(payload.messages[0].role, "system");
  assert.equal(payload.messages[0].content, "system");
  assert.equal(payload.messages[1].role, "user");
  assert.equal(payload.messages[1].content, "user");
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
