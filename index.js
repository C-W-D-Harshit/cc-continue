#!/usr/bin/env node

const { main } = require("./src/cli");

main().catch((error) => {
  const message = error && error.message ? error.message : String(error);
  console.error(`Error: ${message}`);
  if (Array.isArray(error?.suggestions) && error.suggestions.length > 0) {
    console.error("");
    console.error("Next Steps");
    for (const suggestion of error.suggestions) {
      console.error(`- ${suggestion}`);
    }
  }
  process.exit(typeof error?.exitCode === "number" ? error.exitCode : 1);
});
