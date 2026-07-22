import { describe, test, expect, mock } from "bun:test";
import { getConfigPath, loadConfig } from "./config";
import type { Config } from "./types";

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
    expect(config.emitDir).toContain("agents-root\\output");
    expect(config.rootDirs.length).toBeGreaterThan(0);
    config.rootDirs.forEach((d) => expect(d).toContain(".evo"));
  });

  test("reads project name from config", async () => {
    const config = await loadConfig();
    expect(config.project).toBe("evo-ai");
  });
});
