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

  it("injects concrete nested defaults and excludes abstract modules", async () => {
    const root = join(import.meta.dirname, "build", `defaults-${Math.random().toString(36).slice(2)}`);
    const defaults = join(root, "defaults");
    const projectAgents = join(root, "agents");
    const out = join(root, "out");
    mkdirSync(join(root, ".md-merger"), { recursive: true });
    mkdirSync(join(defaults, "agents", "base", "core"), { recursive: true });
    mkdirSync(projectAgents, { recursive: true });
    writeFileSync(join(defaults, "agents", "base", "BasePrimaryAgent.md"), "---\ntype: agent\nabstract: true\n---\n## Role\nInherited base body.");
    writeFileSync(join(defaults, "agents", "base", "core", "plan-o-strator.md"), "---\ntype: agent\nextends: [base/BasePrimaryAgent]\nabstract: false\n---\n## Workflow\nConcrete orchestration body.");
    writeFileSync(join(root, ".md-merger", "config.yaml"), `project: test\nstoreFile: ${join(root, "store.jsonl")}\nemitDirs:\n  agent: ${out}\n  skill: ${join(root, "skills-out")}\nrootDirs:\n  - ${projectAgents}\n`);
    process.env.MD_MERGER_CONFIG = join(root, ".md-merger", "config.yaml");
    try {
      const hooks = await (await import("../src/index")).createMdMergerPlugin(defaults)({ directory: root } as any);
      const config: Record<string, unknown> = {};
      await (hooks as any).config(config);
      const agents = config.agent as Record<string, { prompt: string }>;
      expect(agents["base/core/plan-o-strator"]?.prompt).toContain("Inherited base body.");
      expect(agents["base/core/plan-o-strator"]?.prompt).toContain("Concrete orchestration body.");
      expect(agents["base/BasePrimaryAgent"]).toBeUndefined();
    } finally { process.chdir(originalCwd); rmSync(root, { recursive: true, force: true }); }
  });

  it("lets a concrete project agent extend a bundled abstract base", async () => {
    const root = join(import.meta.dirname, "build", `inherit-${Math.random().toString(36).slice(2)}`);
    const defaults = join(root, "defaults"); const projectAgents = join(root, "agents"); const out = join(root, "out");
    mkdirSync(join(root, ".md-merger"), { recursive: true }); mkdirSync(join(defaults, "agents", "base"), { recursive: true }); mkdirSync(join(projectAgents, "custom"), { recursive: true });
    writeFileSync(join(defaults, "agents", "base", "BaseAgent.md"), "---\ntype: agent\nabstract: true\n---\n## Role\nBundled inherited body.");
    writeFileSync(join(projectAgents, "custom", "worker.md"), "---\ntype: agent\nextends: [base/BaseAgent]\nabstract: false\n---\n## Workflow\nProject concrete body.");
    writeFileSync(join(root, ".md-merger", "config.yaml"), `project: test\nstoreFile: ${join(root, "store.jsonl")}\nemitDirs:\n  agent: ${out}\nrootDirs:\n  - ${projectAgents}\n`); process.env.MD_MERGER_CONFIG = join(root, ".md-merger", "config.yaml");
    try { const hooks = await (await import("../src/index")).createMdMergerPlugin(defaults)({ directory: root } as any); const config: Record<string, unknown> = {}; await (hooks as any).config(config); const prompt = (config.agent as any)["custom/worker"].prompt; expect(prompt).toContain("Bundled inherited body."); expect(prompt).toContain("Project concrete body."); expect((config.agent as any)["base/BaseAgent"]).toBeUndefined(); }
    finally { process.chdir(originalCwd); rmSync(root, { recursive: true, force: true }); }
  });

  it("lets project modules override same-path defaults and skips abstract project modules", async () => {
    const root = join(import.meta.dirname, "build", `override-${Math.random().toString(36).slice(2)}`); const defaults = join(root, "defaults"); const agents = join(root, "agents"); const out = join(root, "out");
    mkdirSync(join(root, ".md-merger"), { recursive: true }); mkdirSync(join(defaults, "agents", "shared"), { recursive: true }); mkdirSync(join(agents, "shared"), { recursive: true });
    writeFileSync(join(defaults, "agents", "shared", "reviewer.md"), "---\ntype: agent\nabstract: false\n---\n## Role\nBundled reviewer body."); writeFileSync(join(agents, "shared", "reviewer.md"), "---\ntype: agent\nabstract: false\n---\n## Role\nProject reviewer body."); writeFileSync(join(agents, "hidden.md"), "---\ntype: agent\nabstract: true\n---\n## Role\nHidden project body.");
    writeFileSync(join(root, ".md-merger", "config.yaml"), `project: test\nstoreFile: ${join(root, "store.jsonl")}\nemitDirs:\n  agent: ${out}\nrootDirs:\n  - ${agents}\n`); process.env.MD_MERGER_CONFIG = join(root, ".md-merger", "config.yaml");
    try { const hooks = await (await import("../src/index")).createMdMergerPlugin(defaults)({ directory: root } as any); const config: Record<string, unknown> = { agent: { "shared/reviewer": { prompt: "pre-existing" } } }; await (hooks as any).config(config); const actual = config.agent as any; expect(actual["shared/reviewer"].prompt).toContain("Project reviewer body."); expect(actual["shared/reviewer"].prompt).not.toContain("Bundled reviewer body."); expect(actual["shared/reviewer"].prompt).not.toBe("pre-existing"); expect(actual.hidden).toBeUndefined(); }
    finally { process.chdir(originalCwd); rmSync(root, { recursive: true, force: true }); }
  });

  it("emits into default .opencode routes when no user config exists", async () => {
    const root = join(import.meta.dirname, "build", `noconfig-${Math.random().toString(36).slice(2)}`); const defaults = join(root, "defaults"); mkdirSync(join(defaults, "agents"), { recursive: true }); mkdirSync(join(defaults, "skills"), { recursive: true }); mkdirSync(join(root, ".opencode"), { recursive: true }); mkdirSync(join(root, ".md-merger", "agents-root", "input"), { recursive: true }); delete process.env.MD_MERGER_CONFIG;
    writeFileSync(join(defaults, "agents", "solo.md"), "---\ntype: agent\nabstract: false\n---\n## Role\nDefault route body."); writeFileSync(join(defaults, "skills", "helper.md"), "---\ntype: skill\nabstract: false\n---\n## Role\nDefault skill body.");
    try { const hooks = await (await import("../src/index")).createMdMergerPlugin(defaults)({ directory: root } as any); const config: Record<string, unknown> = {}; await (hooks as any).config(config); expect((config.agent as any).solo.prompt).toContain("Default route body."); expect(existsSync(join(root, ".opencode", "agents", "solo.md"))).toBe(true); expect(existsSync(join(root, ".opencode", "skills", "helper.md"))).toBe(true); expect((config.agent as any).helper).toBeUndefined(); }
    finally { process.chdir(originalCwd); rmSync(root, { recursive: true, force: true }); }
  });

  it("preserves non-agent emitDirs routes and only injects agent output", async () => {
    const root = join(import.meta.dirname, "build", `routes-${Math.random().toString(36).slice(2)}`); const defaults = join(root, "defaults"); const source = join(root, "source"); const agentOut = join(root, "agent-out"); const skillOut = join(root, "skill-out"); mkdirSync(join(root, ".md-merger"), { recursive: true }); mkdirSync(defaults, { recursive: true }); mkdirSync(source, { recursive: true });
    writeFileSync(join(source, "worker.md"), "---\ntype: agent\nabstract: false\n---\n## Role\nAgent body."); writeFileSync(join(source, "helper.md"), "---\ntype: skill\nabstract: false\n---\n## Role\nSkill body."); writeFileSync(join(root, ".md-merger", "config.yaml"), `project: test\nstoreFile: ${join(root, "store.jsonl")}\nemitDirs:\n  agent: ${agentOut}\n  skill: ${skillOut}\nrootDirs:\n  - ${source}\n`); process.env.MD_MERGER_CONFIG = join(root, ".md-merger", "config.yaml");
    try { const hooks = await (await import("../src/index")).createMdMergerPlugin(defaults)({ directory: root } as any); const config: Record<string, unknown> = {}; expect(await (hooks as any).config(config)).toBeUndefined(); expect((config.agent as any).worker.prompt).toContain("Agent body."); expect((config.agent as any).helper).toBeUndefined(); expect(existsSync(join(skillOut, "helper.md"))).toBe(true); }
    finally { process.chdir(originalCwd); rmSync(root, { recursive: true, force: true }); }
  });

  it("restores cwd and MD_MERGER_CONFIG when initialization fails", async () => {
    const root = join(import.meta.dirname, "build", `failure-${Math.random().toString(36).slice(2)}`); const defaults = join(root, "defaults"); mkdirSync(defaults, { recursive: true }); const configPath = join(root, "config.yaml"); writeFileSync(configPath, `project: test\nstoreFile: ${join(root, "store.jsonl")}\nemitDirs:\n  agent: ${join(root, "out")}\nrootDirs:\n  - ${join(root, "missing-input-root")}\n`); const cwd = process.cwd(); const before = process.env.MD_MERGER_CONFIG; process.env.MD_MERGER_CONFIG = configPath;
    try { const hooks = await (await import("../src/index")).createMdMergerPlugin(defaults)({ directory: root } as any); expect(hooks).toEqual({}); expect(process.cwd()).toBe(cwd); expect(process.env.MD_MERGER_CONFIG).toBe(configPath); }
    finally { process.chdir(cwd); if (before === undefined) delete process.env.MD_MERGER_CONFIG; else process.env.MD_MERGER_CONFIG = before; rmSync(root, { recursive: true, force: true }); }
  });
});

const originalCwd = process.cwd();
const originalConfig = process.env.MD_MERGER_CONFIG;
