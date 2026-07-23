import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { parseCliArgs, run } from "@evo/cli";
import { resolve } from "node:path";

const PROJECT_ROOT = resolve(import.meta.dirname, "..", "..");

describe("parseCliArgs", () => {
  test("defaults to help when no args", () => {
    const result = parseCliArgs([]);
    expect(result.cmd).toBe("help");
    expect(result.args).toEqual([]);
  });

  test("parses command and remaining args", () => {
    const result = parseCliArgs(["emit", "--dry-run"]);
    expect(result.cmd).toBe("emit");
    expect(result.args).toEqual(["--dry-run"]);
  });

  test("parses render command with module name", () => {
    const result = parseCliArgs(["render", "agents/coder"]);
    expect(result.cmd).toBe("render");
    expect(result.args).toEqual(["agents/coder"]);
  });

  test("parses config sub-command", () => {
    const result = parseCliArgs(["config", "show"]);
    expect(result.cmd).toBe("config");
    expect(result.args).toEqual(["show"]);
  });

  test("handles unknown command", () => {
    const result = parseCliArgs(["unknown-cmd"]);
    expect(result.cmd).toBe("unknown-cmd");
    expect(result.args).toEqual([]);
  });
});

describe("run error paths", () => {
  const origEnv = process.env.EVO_CONFIG;
  beforeEach(() => {
    process.env.EVO_CONFIG = resolve(PROJECT_ROOT, "tests", "resources", "agents-root", "config.yaml");
  });
  afterEach(() => {
    if (origEnv === undefined) delete process.env.EVO_CONFIG;
    else process.env.EVO_CONFIG = origEnv;
  });

  test("throws on unknown command", async () => {
    await expect(run(["unknown"])).rejects.toThrow("Unknown command: unknown");
  });

  test("throws on render without module name", async () => {
    await expect(run(["render"])).rejects.toThrow("Usage: evo render <module>");
  });

  test("help command does not throw", async () => {
    await expect(run([])).resolves.toBeUndefined();
  });
});
