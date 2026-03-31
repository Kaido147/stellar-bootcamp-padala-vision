import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const currentDirPath = dirname(fileURLToPath(import.meta.url));
const backendRoot = resolve(currentDirPath, "../..");
const repoRoot = resolve(backendRoot, "..");

test("env module loads backend/.env when executed from repo root", () => {
  const output = execFileSync(
    "node",
    [
      "--import",
      "tsx",
      "--eval",
      [
        "import { env, runtimeCapabilities } from './backend/src/config/env.ts';",
        "console.log(JSON.stringify({",
        "  geminiKeyPresent: Boolean(env.GEMINI_API_KEY),",
        "  geminiProofAnalysisEnabled: runtimeCapabilities.geminiProofAnalysisEnabled,",
        "}, null, 2));",
      ].join("\n"),
    ],
    {
      cwd: repoRoot,
      encoding: "utf8",
    },
  );

  const parsed = JSON.parse(lastJsonLine(output)) as {
    geminiKeyPresent: boolean;
    geminiProofAnalysisEnabled: boolean;
  };

  assert.equal(parsed.geminiKeyPresent, true);
  assert.equal(parsed.geminiProofAnalysisEnabled, true);
});

test("env module loads backend/.env when executed from backend directory", () => {
  const output = execFileSync(
    "node",
    [
      "--import",
      "tsx",
      "--eval",
      [
        "import { env, runtimeCapabilities } from './src/config/env.ts';",
        "console.log(JSON.stringify({",
        "  geminiKeyPresent: Boolean(env.GEMINI_API_KEY),",
        "  geminiProofAnalysisEnabled: runtimeCapabilities.geminiProofAnalysisEnabled,",
        "}, null, 2));",
      ].join("\n"),
    ],
    {
      cwd: backendRoot,
      encoding: "utf8",
    },
  );

  const parsed = JSON.parse(lastJsonLine(output)) as {
    geminiKeyPresent: boolean;
    geminiProofAnalysisEnabled: boolean;
  };

  assert.equal(parsed.geminiKeyPresent, true);
  assert.equal(parsed.geminiProofAnalysisEnabled, true);
});

function lastJsonLine(output: string) {
  const trimmed = output.trim();
  const start = trimmed.lastIndexOf("{");
  return trimmed.slice(start);
}
