import { describe, expect, it } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

describe.serial("plugin initialization", () => {
  it("plugin exports mdMergerPlugin as an async function", async () => {
    const plugin = await import("../src/index");
    expect(plugin.mdMergerPlugin).toBeDefined();
    expect(typeof plugin.mdMergerPlugin).toBe("function");
  });

  it("plugin returns hooks object on success", async () => {
    const root = join(import.meta.dirname, "build", `hooks-${Math.random().toString(36).slice(2)}`);
    const previousCwd = process.cwd();
    const previousConfig = process.env.MD_MERGER_CONFIG;
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
      process.chdir(previousCwd);
      if (previousConfig === undefined) delete process.env.MD_MERGER_CONFIG;
      else process.env.MD_MERGER_CONFIG = previousConfig;
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("automatically builds fresh source Markdown and injects it", async () => {
    const root = join(import.meta.dirname, "build", `plugin-${Math.random().toString(36).slice(2)}`);
    const previousCwd = process.cwd();
    const previousConfig = process.env.MD_MERGER_CONFIG;
    const agents = join(root, "agents");
    mkdirSync(join(root, ".md-merger"), { recursive: true });
    mkdirSync(agents, { recursive: true });
    writeFileSync(join(root, ".md-merger", "config.yaml"), `project: test\nstoreFile: ${join(root, "store.jsonl")}\nemitDirs:\n  default: ${join(root, "out")}\nrootDirs:\n  - ${agents}\n`);
    writeFileSync(join(agents, "fresh.md"), "---\ntype: default\n---\n## Role\nFresh source prompt");
    process.env.MD_MERGER_CONFIG = join(root, ".md-merger", "config.yaml");
    try {
      const plugin = await import("../src/index");
      const hooks = await plugin.mdMergerPlugin({ directory: root } as any);
      const config: Record<string, unknown> = {};
      await (hooks as any).config(config);
      expect((config.agent as any).fresh.prompt).toContain("Fresh source prompt");
    } finally {
      process.chdir(previousCwd);
      if (previousConfig === undefined) delete process.env.MD_MERGER_CONFIG;
      else process.env.MD_MERGER_CONFIG = previousConfig;
      rmSync(root, { recursive: true, force: true });
    }
  });
});
