import { afterEach, describe, expect, it } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
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

  it("recursively loads nested bundled defaults when nothing is emitted", async () => {
    const root = join(import.meta.dirname, "build", `fallback-${Math.random().toString(36).slice(2)}`);
    const defaults = join(import.meta.dirname, "..", "defaults", "agents");
    const fixtureDefaults: string[] = [join(defaults, "test-boundary-a", "core", "explorer.md"), join(defaults, "test-boundary-b", "core", "explorer.md")];
    mkdirSync(join(root, ".md-merger"), { recursive: true });
    mkdirSync(join(defaults, "test-boundary-a", "core"), { recursive: true });
    mkdirSync(join(defaults, "test-boundary-b", "core"), { recursive: true });
    writeFileSync(join(root, ".md-merger", "config.yaml"), `project: test\nstoreFile: ${join(root, "store.jsonl")}\nemitDirs:\n  agent: ${join(root, "out")}\nrootDirs:\n  - ${join(root, "agents")}\n`);
    mkdirSync(join(root, "agents"), { recursive: true });
    writeFileSync(fixtureDefaults[0]!, "Nested fallback prompt");
    writeFileSync(fixtureDefaults[1]!, "Other explorer prompt");
    process.env.MD_MERGER_CONFIG = join(root, ".md-merger", "config.yaml");
    try {
      const { loadBundledDefaults } = await import("../src/index");
      const loaded = await loadBundledDefaults(defaults);
      expect(loaded.get("test-boundary-a/core/explorer")).toBe("Nested fallback prompt");
      const both = await loadBundledDefaults(defaults);
      expect(both.get("test-boundary-b/core/explorer")).toBe("Other explorer prompt");

      const hooks = await (await import("../src/index")).mdMergerPlugin({ directory: root } as any);
      const opencodeConfig: Record<string, unknown> = {};
      await (hooks as any).config(opencodeConfig);
      expect((opencodeConfig.agent as any)["test-boundary-a/core/explorer"].prompt).toBe("Nested fallback prompt");
      expect((opencodeConfig.agent as any)["test-boundary-b/core/explorer"].prompt).toBe("Other explorer prompt");
    } finally {
      process.chdir(originalCwd);
      for (const file of fixtureDefaults) rmSync(join(file, "..", ".."), { recursive: true, force: true });
      rmSync(root, { recursive: true, force: true });
    }
  });
});

const originalCwd = process.cwd();
const originalConfig = process.env.MD_MERGER_CONFIG;
const originalDefaults = process.env.MD_MERGER_DEFAULTS_DIR;
