import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { run } from "../../src/cli";
import { loadConfig } from "../../src/config";
import { readFileSync, readdirSync, rmSync, existsSync, mkdirSync } from "node:fs";
import { relative, resolve } from "node:path";

const PROJECT_ROOT = resolve(import.meta.dirname, "..", "..");
const SCENARIO_ROOT = resolve(PROJECT_ROOT, "tests", "resources", "agents-root");
const BUILD_DIR = resolve(PROJECT_ROOT, "tests", "build");

/** Walk a directory and return relative paths of all files */
function collectFiles(dir: string): string[] {
  const results: string[] = [];
  const entries = readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = resolve(dir, entry.name);
    if (entry.isDirectory()) {
      const subFiles = collectFiles(fullPath);
      for (const f of subFiles) {
        results.push(entry.name + "/" + f);
      }
    } else {
      results.push(relative(dir, fullPath).replace(/\\/g, "/"));
    }
  }
  return results;
}

const configPath = resolve(SCENARIO_ROOT, "config.yaml");
const expectedOutputDir = resolve(SCENARIO_ROOT, "output");

describe("E2E: agents-root", () => {
  const origEnv = process.env.EVO_CONFIG;
  const origCwd = process.cwd();

  beforeEach(() => {
    // Clean build directory
    if (existsSync(BUILD_DIR)) {
      rmSync(BUILD_DIR, { recursive: true, force: true });
    }
    mkdirSync(BUILD_DIR, { recursive: true });
    // Set config to point to the test scenario
    process.env.EVO_CONFIG = configPath;
    try {
      process.chdir(PROJECT_ROOT);
    } catch (e) {
      throw new Error(`Cannot chdir to ${PROJECT_ROOT}: ${(e as Error).message}`);
    }
  });

  afterEach(() => {
    if (origEnv === undefined) delete process.env.EVO_CONFIG;
    else process.env.EVO_CONFIG = origEnv;
    process.chdir(origCwd);
  });

  test("build then emit produces expected output", async () => {
    // C2: Assert cwd before each phase — config resolution depends on process.cwd()
    expect(process.cwd()).toBe(PROJECT_ROOT);

    // Phase 1: Build — import markdown files into JSONL store
    await run(["build"]);

    // After build, verify store was created
    const storeFile = resolve(BUILD_DIR, "prompts.jsonl");
    expect(
      existsSync(storeFile),
      "Build did not create the JSONL store at " + storeFile
    ).toBe(true);

    // C2: Assert cwd before emit phase too
    expect(process.cwd()).toBe(PROJECT_ROOT);

    // Phase 2: Emit — resolve inheritance and write output files
    await run(["emit"]);

    // W3: Load config to get actual emitDirs instead of hardcoding path structure
    const config = await loadConfig();
    const emitDirs = config.emitDirs;

    // Phase 3: Validate — diff generated vs expected output
    if (!existsSync(expectedOutputDir)) {
      throw new Error(`Expected output directory not found: ${expectedOutputDir}`);
    }

    const expectedFiles = collectFiles(expectedOutputDir);
    expect(expectedFiles.length).toBeGreaterThan(0);

    for (const filePath of expectedFiles) {
      const expectedPath = resolve(expectedOutputDir, filePath);
      // W3: Use actual emitDirs from config to determine generated file location
      const fileName = filePath.split("/").pop();
      let generatedPath: string | null = null;
      for (const targetDir of Object.values(emitDirs)) {
        const candidate = resolve(targetDir, fileName!);
        if (existsSync(candidate)) {
          generatedPath = candidate;
          break;
        }
      }

      expect(
        generatedPath !== null,
        `Generated file missing. Expected in one of emitDirs: ${JSON.stringify(emitDirs)}; looked for ${fileName}`
      ).toBe(true);

      const expectedContent = readFileSync(expectedPath, "utf-8");
      const generatedContent = readFileSync(generatedPath!, "utf-8");

      expect(generatedContent).toBe(expectedContent);
    }
  });
});
