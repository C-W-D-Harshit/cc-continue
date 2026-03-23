import { main } from "./cli.js";
import type { AppError } from "./types.js";

void main().catch((error: unknown) => {
  const appError = error as AppError;
  const message = appError?.message ? appError.message : String(error);
  console.error(`Error: ${message}`);
  if (Array.isArray(appError?.suggestions) && appError.suggestions.length > 0) {
    console.error("");
    console.error("Next Steps");
    for (const suggestion of appError.suggestions) {
      console.error(`- ${suggestion}`);
    }
  }
  process.exit(typeof appError?.exitCode === "number" ? appError.exitCode : 1);
});
