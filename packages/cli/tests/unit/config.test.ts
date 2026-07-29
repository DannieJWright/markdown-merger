import { describe, test, expect, spyOn } from "bun:test";
import { getConfigPath, loadConfig } from "@md-merger/config";
import { join } from "node:path";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";

const baseTempDir = join(import.meta.dirname, "..", "build", "tmp");
describe("getConfigPath", () => {
  test("uses MD_MERGER_CONFIG env var when set", () => {
    const orig = process.env.MD_MERGER_CONFIG;
    process.env.MD_MERGER_CONFIG = "/custom/path/config.yaml";
    expect(getConfigPath()).toBe("/custom/path/config.yaml");
    if (orig === undefined) {
      delete process.env.MD_MERGER_CONFIG;
    } else {
      process.env.MD_MERGER_CONFIG = orig;
    }
  });

  test("defaults to .md-merger/config.yaml", () => {
    const orig = process.env.MD_MERGER_CONFIG;
    delete process.env.MD_MERGER_CONFIG;
    expect(getConfigPath()).toBe(".md-merger/config.yaml");
    if (orig === undefined) {
      delete process.env.MD_MERGER_CONFIG;
    } else {
      process.env.MD_MERGER_CONFIG = orig;
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
    const tmpDir = join(baseTempDir, "evo-project-test-" + Math.random().toString(36).slice(2));
    const cfgPath = join(tmpDir, "cfg.yaml");
    mkdirSync(tmpDir, { recursive: true });
    writeFileSync(cfgPath, [
      `project: md-merger`,
      `version: "1"`,
      `storeFile: ${join(tmpDir, "store.jsonl")}`,
    ].join("\n"));

    const origEnv = process.env.MD_MERGER_CONFIG;
    try {
      process.env.MD_MERGER_CONFIG = cfgPath;
      const config = await loadConfig();
      expect(config.project).toBe("md-merger");
    } finally {
      if (origEnv === undefined) delete process.env.MD_MERGER_CONFIG;
      else process.env.MD_MERGER_CONFIG = origEnv;
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});

describe("loadConfig emitDirs", () => {
  test("emitDirs defaults to { default: 'output' }", async () => {
    const tmpDir = join(baseTempDir, "evo-emitdirs-default-" + Math.random().toString(36).slice(2));
    const cfgPath = join(tmpDir, "cfg.yaml");
    mkdirSync(tmpDir, { recursive: true });
    writeFileSync(cfgPath, [
      `project: test`,
      `version: "1"`,
      `storeFile: ${join(tmpDir, "store.jsonl")}`,
    ].join("\n"));

    const origEnv = process.env.MD_MERGER_CONFIG;
    try {
      process.env.MD_MERGER_CONFIG = cfgPath;
      const config = await loadConfig();
      expect(config.emitDirs).toBeDefined();
      expect(config.emitDirs.default).toBe(join(process.cwd(), "output"));
    } finally {
      if (origEnv === undefined) delete process.env.MD_MERGER_CONFIG;
      else process.env.MD_MERGER_CONFIG = origEnv;
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  test("parses indented key-value pairs as nested object", async () => {
    const tmpDir = join(baseTempDir, "evo-emitdirs-test-" + Math.random().toString(36).slice(2));
    const cfgPath = join(tmpDir, "cfg.yaml");
    mkdirSync(tmpDir, { recursive: true });
    writeFileSync(cfgPath, [
      `project: test`,
      `version: "1"`,
      `storeFile: ${join(tmpDir, "store.jsonl")}`,
      `emitDirs:`,
      `  skill: path/to/skill`,
      `  agent: path/to/agent`,
      `rootDirs:`,
      `  - ${tmpDir}/input`,
    ].join("\n"));

    const origEnv = process.env.MD_MERGER_CONFIG;
    try {
      process.env.MD_MERGER_CONFIG = cfgPath;
      const config = await loadConfig();
      expect(config.emitDirs.skill).toBe(join(process.cwd(), "path/to/skill"));
      expect(config.emitDirs.agent).toBe(join(process.cwd(), "path/to/agent"));
      expect(config.emitDirs.default).toBeUndefined();
    } finally {
      if (origEnv === undefined) delete process.env.MD_MERGER_CONFIG;
      else process.env.MD_MERGER_CONFIG = origEnv;
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

 test("resolves multiple emitDirs keys to absolute paths", async () => {
    const tmpDirBase = join(baseTempDir, "evo-multi-emit-" + Math.random().toString(36).slice(2));
    const cfgPath = join(tmpDirBase, "cfg.yaml");
    mkdirSync(tmpDirBase, { recursive: true });
    mkdirSync(join(tmpDirBase, "input"), { recursive: true });
    writeFileSync(cfgPath, [
      `project: test`,
      `version: "1"`,
      `storeFile: ${join(tmpDirBase, "store.jsonl")}`,
      `emitDirs:`,
      `  skill: skills-out`,
      `  agent: agents-out`,
      `rootDirs:`,
      `  - input`,
    ].join("\n"));

    const origEnv = process.env.MD_MERGER_CONFIG;
    const origCwd = process.cwd();
    try {
      process.env.MD_MERGER_CONFIG = cfgPath;
      process.chdir(tmpDirBase);
      const config = await loadConfig();
      expect(config.emitDirs.skill).toBe(join(tmpDirBase, "skills-out"));
      expect(config.emitDirs.agent).toBe(join(tmpDirBase, "agents-out"));
    } finally {
      process.chdir(origCwd);
      if (origEnv === undefined) delete process.env.MD_MERGER_CONFIG;
      else process.env.MD_MERGER_CONFIG = origEnv;
      rmSync(tmpDirBase, { recursive: true, force: true });
    }
  });

  test("warns when old emitDir format is detected", async () => {
    const tmpDir = join(baseTempDir, "evo-migrate-test-" + Math.random().toString(36).slice(2));
    const cfgPath = join(tmpDir, "cfg.yaml");
    mkdirSync(tmpDir, { recursive: true });
    writeFileSync(cfgPath, [
      `project: test`,
      `version: "1"`,
      `storeFile: ${join(tmpDir, "store.jsonl")}`,
      `emitDir: legacy-output`,
      `rootDirs:`,
      `  - ${tmpDir}/input`,
    ].join("\n"));

    const origEnv = process.env.MD_MERGER_CONFIG;
    const warnSpy = spyOn(console, "warn").mockImplementation(() => {});
    try {
      process.env.MD_MERGER_CONFIG = cfgPath;
      await loadConfig();
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining("deprecated")
      );
    } finally {
      warnSpy.mockRestore();
      if (origEnv === undefined) delete process.env.MD_MERGER_CONFIG;
      else process.env.MD_MERGER_CONFIG = origEnv;
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});

describe("loadConfig CWD path resolution", () => {
  test("resolves relative paths against process.cwd()", async () => {
    const config = await loadConfig();
    expect(config.storeFile).toMatch(process.cwd());
    for (const dir of Object.values(config.emitDirs)) {
      expect(dir).toMatch(process.cwd());
    }
    for (const dir of config.rootDirs) {
      expect(dir).toMatch(process.cwd());
    }
  });

  test("passes absolute paths through unchanged", async () => {
    const tmpDir = join(baseTempDir, "evo-abs-test-" + Math.random().toString(36).slice(2));
    const cfgPath = join(tmpDir, "abs.yaml");
    const storeAbs = join(tmpDir, "abs-store.jsonl");
    mkdirSync(tmpDir, { recursive: true });
    writeFileSync(cfgPath, `project: test\nversion: "1"\nstoreFile: ${storeAbs}\nemitDirs:\n  default: ${tmpDir}\nrootDirs:\n  - ${tmpDir}`);

    const origEnv = process.env.MD_MERGER_CONFIG;
    try {
      process.env.MD_MERGER_CONFIG = cfgPath;
      const config = await loadConfig();
      expect(config.storeFile).toBe(storeAbs);
      expect(config.emitDirs.default).toBe(tmpDir);
      expect(config.rootDirs).toEqual([tmpDir]);
    } finally {
      if (origEnv === undefined) delete process.env.MD_MERGER_CONFIG;
      else process.env.MD_MERGER_CONFIG = origEnv;
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});
