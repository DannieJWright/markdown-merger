import { describe, test, expect } from "bun:test";
import { getConfigPath, loadConfig } from "./config";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
describe("getConfigPath", () => {
  test("uses EVO_CONFIG env var when set", () => {
    const orig = process.env.EVO_CONFIG;
    process.env.EVO_CONFIG = "/custom/path/config.yaml";
    expect(getConfigPath()).toBe("/custom/path/config.yaml");
    if (orig === undefined) {
      delete process.env.EVO_CONFIG;
    } else {
      process.env.EVO_CONFIG = orig;
    }
  });

  test("defaults to .evo/config.yaml", () => {
    const orig = process.env.EVO_CONFIG;
    delete process.env.EVO_CONFIG;
    expect(getConfigPath()).toBe(".evo/config.yaml");
    if (orig === undefined) {
      delete process.env.EVO_CONFIG;
    } else {
      process.env.EVO_CONFIG = orig;
    }
  });
});

describe("loadConfig", () => {
  test("merges with defaults for missing keys", async () => {
    const config = await loadConfig();
    expect(config.maxInheritDepth).toBe(5);
    expect(config.storeFile).toContain("prompts.jsonl");
    expect(config.rootDirs.length).toBeGreaterThan(0);
  });

  test("reads project name from config", async () => {
    const config = await loadConfig();
    expect(config.project).toBe("evo-ai");
  });
});

describe("loadConfig CWD path resolution", () => {
  test("resolves relative paths against process.cwd()", async () => {
    const config = await loadConfig();
    // storeFile should be an absolute path under cwd
    expect(config.storeFile).toMatch(process.cwd());
    // emitDir should be an absolute path under cwd
    expect(config.emitDir).toMatch(process.cwd());
    // rootDirs should contain absolute paths under cwd
    for (const dir of config.rootDirs) {
      expect(dir).toMatch(process.cwd());
    }
  });

  test("passes absolute paths through unchanged", async () => {
    const tmpDir = join(tmpdir(), "evo-abs-test-" + Math.random().toString(36).slice(2));
    const cfgPath = join(tmpDir, "abs.yaml");
    const storeAbs = join(tmpDir, "abs-store.jsonl");
    mkdirSync(tmpDir, { recursive: true });
    writeFileSync(cfgPath, `project: test\nversion: "1"\nstoreFile: ${storeAbs}\nemitDir: ${tmpDir}\nrootDirs:\n  - ${tmpDir}`);

    const origEnv = process.env.EVO_CONFIG;
    try {
      process.env.EVO_CONFIG = cfgPath;
      const config = await loadConfig();
      expect(config.storeFile).toBe(storeAbs);
      expect(config.emitDir).toBe(tmpDir);
      expect(config.rootDirs).toEqual([tmpDir]);
    } finally {
      if (origEnv === undefined) delete process.env.EVO_CONFIG;
      else process.env.EVO_CONFIG = origEnv;
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});
