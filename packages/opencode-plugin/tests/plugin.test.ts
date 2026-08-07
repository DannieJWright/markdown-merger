import { afterEach, describe, expect, it } from "bun:test";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

describe.serial("plugin initialization", () => {
  afterEach(() => {
    process.chdir(originalCwd);
    if (originalConfig === undefined) delete process.env.MD_MERGER_CONFIG;
    else process.env.MD_MERGER_CONFIG = originalConfig;
  });

  it("plugin exports mdMergerPlugin as an async function", async () => {
    const plugin = await import("../src/index");
    expect(plugin.mdMergerPlugin).toBeDefined();
    expect(typeof plugin.mdMergerPlugin).toBe("function");
  });

  it("plugin returns hooks object on success", async () => {
    const root = join(import.meta.dirname, "build", `hooks-${Math.random().toString(36).slice(2)}`);
    const agents = join(root, "agents");
    mkdirSync(join(root, ".md-merger"), { recursive: true });
    mkdirSync(agents, { recursive: true });
    writeFileSync(join(root, ".md-merger", "config.yaml"), `project: test\nstoreFile: ${join(root, "store.jsonl")}\nemitDirs:\n  default: ${join(root, "out")}\nrootDirs:\n  - ${agents}\n`);
    process.env.MD_MERGER_CONFIG = join(root, ".md-merger", "config.yaml");
    try {
    const plugin = await import("../src/index");
    const hooks = await plugin.mdMergerPlugin({ directory: root } as any);
    expect(hooks).toBeDefined();
    expect(typeof hooks).toBe("object");
    } finally {
      process.chdir(originalCwd);
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("restores cwd after initialization", async () => {
    const root = join(import.meta.dirname, "build", `cwd-${Math.random().toString(36).slice(2)}`);
    mkdirSync(join(root, ".md-merger", "agents"), { recursive: true });
    writeFileSync(join(root, ".md-merger", "config.yaml"), `project: test\nstoreFile: ${join(root, "store.jsonl")}\nemitDirs:\n  agent: ${join(root, "out")}\nrootDirs:\n  - ${join(root, ".md-merger", "agents")}\n`);
    process.env.MD_MERGER_CONFIG = join(root, ".md-merger", "config.yaml");
    const cwd = process.cwd();
    try {
      const plugin = await import("../src/index");
      await plugin.mdMergerPlugin({ directory: root } as any);
      expect(process.cwd()).toBe(cwd);
    } finally {
      process.chdir(originalCwd);
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("automatically builds fresh source Markdown and injects it", async () => {
    const root = join(import.meta.dirname, "build", `plugin-${Math.random().toString(36).slice(2)}`);
    const agents = join(root, "agents");
    mkdirSync(join(root, ".md-merger"), { recursive: true });
    mkdirSync(agents, { recursive: true });
    writeFileSync(join(root, ".md-merger", "config.yaml"), `project: test\nstoreFile: ${join(root, "store.jsonl")}\nemitDirs:\n  agent: ${join(root, "out")}\nrootDirs:\n  - ${agents}\n`);
    writeFileSync(join(agents, "fresh.md"), "---\ntype: agent\n---\n## Role\nFresh source prompt");
    process.env.MD_MERGER_CONFIG = join(root, ".md-merger", "config.yaml");
    try {
      const plugin = await import("../src/index");
      const hooks = await plugin.mdMergerPlugin({ directory: root } as any);
      const config: Record<string, unknown> = {};
      await (hooks as any).config(config);
      expect((config.agent as any).fresh.prompt).toContain("Fresh source prompt");
    } finally {
      process.chdir(originalCwd);
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("discovers every immediate directory under defaults as an input root", async () => {
    const { discoverDefaultRoots } = await import("../src/index");
    const fixture = join(import.meta.dirname, "build", `roots-${Math.random().toString(36).slice(2)}`);
    mkdirSync(join(fixture, "agents"), { recursive: true }); mkdirSync(join(fixture, "skills"), { recursive: true });
    writeFileSync(join(fixture, "notes.md"), "not a root");
    try { expect(await discoverDefaultRoots(fixture)).toEqual([join(fixture, "agents"), join(fixture, "skills")]); }
    finally { rmSync(fixture, { recursive: true, force: true }); }
  });

  it("does not export a raw bundled-default loader", async () => {
    const plugin = await import("../src/index");
    expect((plugin as Record<string, unknown>).loadBundledDefaults).toBeUndefined();
  });
});

const originalCwd = process.cwd();
const originalConfig = process.env.MD_MERGER_CONFIG;
