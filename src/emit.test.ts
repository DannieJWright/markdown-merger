import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { mkdirSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { emitAll, renderPromptText } from "./emit";
import { updateOrCreate } from "./store";
import type { Config } from "./types";

const testDir = join(tmpdir(), "evo-test-emit-" + Math.random().toString(36).slice(2));
const storePath = join(testDir, "store.jsonl");
const emitDir = join(testDir, "output");

beforeEach(() => {
  mkdirSync(testDir, { recursive: true });
});
afterEach(() => {
  rmSync(testDir, { recursive: true, force: true });
});

describe("renderPromptText", () => {
  test("renders frontmatter and sections as markdown", async () => {
    await updateOrCreate(storePath, "base", "test", {
      sections: [{ name: "role", body: "You are helpful." }],
      frontmatter: { name: "Base Agent", mode: "subagent" },
    });
    const output = await renderPromptText(storePath, "base", 5);
    expect(output).toContain("---");
    expect(output).toContain("## Role");
    expect(output).toContain("You are helpful.");
  });

  test("strips extends from output frontmatter", async () => {
    await updateOrCreate(storePath, "child", "test", {
      extends: ["base"],
      sections: [{ name: "role", body: "child" }],
      frontmatter: { name: "Child" },
    });
    await updateOrCreate(storePath, "base", "test", {
      sections: [],
      frontmatter: {},
    });
    const output = await renderPromptText(storePath, "child", 5);
    expect(output).not.toContain("extends");
  });

  test("strips abstract from output frontmatter", async () => {
    await updateOrCreate(storePath, "base", "test", {
      abstract: true,
      sections: [{ name: "role", body: "base" }],
      frontmatter: { name: "Base", abstract: true },
    });
    const output = await renderPromptText(storePath, "base", 5);
    expect(output).not.toContain("abstract");
  });
});

describe("emitAll", () => {
  test("writes merged markdown files", async () => {
    await updateOrCreate(storePath, "base", "test", {
      sections: [{ name: "role", body: "You are helpful." }],
      frontmatter: { name: "Base" },
      status: "active" as const,
      abstract: false,
    });
    const config: Config = {
      project: "test",
      version: "1",
      maxInheritDepth: 5,
      storeFile: "store.jsonl",
      emitDir: emitDir,
      rootDirs: [],
    };
    const paths = await emitAll(storePath, emitDir, config, false);
    expect(paths.length).toBeGreaterThan(0);
    expect(readFileSync(join(emitDir, "base.md"), "utf-8")).toContain("## Role");
  });

  test("skips abstract agents", async () => {
    await updateOrCreate(storePath, "abstract-base", "test", {
      sections: [{ name: "role", body: "abstract" }],
      frontmatter: {},
      status: "active" as const,
      abstract: true,
    });
    const config: Config = {
      project: "test",
      version: "1",
      maxInheritDepth: 5,
      storeFile: "store.jsonl",
      emitDir: emitDir,
      rootDirs: [],
    };
    const paths = await emitAll(storePath, emitDir, config, false);
    expect(paths).not.toContain("abstract-base.md");
  });
});
