import { afterEach, describe, expect, it } from "bun:test";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { findLatest } from "@md-merger/store";

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

  it("supports root export aliases with later project overrides", async () => {
    const root = join(import.meta.dirname, "build", `root-export-${Math.random().toString(36).slice(2)}`);
    const defaults = join(root, "defaults"); const bundled = join(defaults, "agents");
    const project = join(root, "project"); const out = join(root, "out"); const storePath = join(root, "store.jsonl");
    mkdirSync(join(bundled, "base"), { recursive: true }); mkdirSync(project, { recursive: true });
    writeFileSync(join(bundled, "base", "orchestrator.md"), "---\ntype: agent\nextends: [base-orchestrator]\n---\n## Description\nOrchestrator.\n## Role\nThis is the concrete base orchestrator.");
    writeFileSync(join(bundled, "base", "base-orchestrator.md"), "---\ntype: agent\nabstract: true\n---\n## Role\nBase agent.");
    writeFileSync(join(bundled, "md-merger-root.yaml"), "exports:\n  base-orchestrator: base/base-orchestrator.md\n");
    mkdirSync(join(project, "user"), { recursive: true }); mkdirSync(join(project, "base"), { recursive: true });
    writeFileSync(join(project, "user", "base-orchestrator.md"), "---\ntype: agent\nextends: [base/base-orchestrator]\nabstract: true\n---\n## Subrole\nUser Orchestrator.");
    writeFileSync(join(project, "md-merger-root.yaml"), "exports:\n  base-orchestrator: user/base-orchestrator.md\n");
    process.env.MD_MERGER_CONFIG = join(root, ".md-merger", "config.yaml");
    mkdirSync(join(root, ".md-merger"), { recursive: true });
    writeFileSync(join(root, ".md-merger", "config.yaml"), `project: test\nstoreFile: ${storePath}\nemitDirs:\n  agent: ${out}\nrootDirs:\n  - ${project}\n`);
    try {
      const hooks = await (await import("../src/index")).createMdMergerPlugin(defaults)({ directory: root } as any);
      expect((await findLatest(storePath, "base/orchestrator"))?.extends).toEqual(["user/base-orchestrator"]);
      expect((await findLatest(storePath, "user/base-orchestrator"))?.extends).toEqual(["base/base-orchestrator"]);
      const opencodeConfig: Record<string, unknown> = {}; await (hooks as any).config(opencodeConfig);
      const prompt = (opencodeConfig.agent as Record<string, { prompt: string }>) ["base/orchestrator"]?.prompt;
      expect(prompt).toContain("This is the concrete base orchestrator."); expect(prompt).toContain("Orchestrator."); expect(prompt).toContain("User Orchestrator.");
      expect((opencodeConfig.agent as Record<string, unknown>)["base/base-orchestrator"]).toBeUndefined();
      expect((opencodeConfig.agent as Record<string, unknown>)["user/base-orchestrator"]).toBeUndefined();
    } finally { process.chdir(originalCwd); rmSync(root, { recursive: true, force: true }); }
  });

  it("injects an inherited concrete default under its active alias only", async () => {
    const root = join(import.meta.dirname, "build", `inherited-alias-${Math.random().toString(36).slice(2)}`);
    const defaults = join(root, "defaults"); const bundled = join(defaults, "agents"); const out = join(root, "out");
    mkdirSync(join(root, ".md-merger"), { recursive: true }); mkdirSync(join(bundled, "base"), { recursive: true });
    writeFileSync(join(bundled, "base.md"), "---\ntype: agent\nabstract: true\n---\n## Role\nInherited parent content.");
    writeFileSync(join(bundled, "base", "concrete.md"), "---\ntype: agent\nextends: [base]\n---\n## Workflow\nConcrete child content.");
    writeFileSync(join(bundled, "md-merger-root.yaml"), "exports:\n  orchestrator: base/concrete.md\n");
    writeFileSync(join(root, ".md-merger", "config.yaml"), `project: test\nstoreFile: ${join(root, "store.jsonl")}\nemitDirs:\n  agent: ${out}\nrootDirs: []\n`);
    process.env.MD_MERGER_CONFIG = join(root, ".md-merger", "config.yaml");
    try {
      const hooks = await (await import("../src/index")).createMdMergerPlugin(defaults)({ directory: root } as any);
      const config: Record<string, unknown> = {}; await (hooks as any).config(config);
      const agents = config.agent as Record<string, { prompt: string }>;
      expect(agents.orchestrator?.prompt).toContain("Inherited parent content.");
      expect(agents.orchestrator?.prompt).toContain("Concrete child content.");
      expect(agents["base/concrete"]).toBeUndefined();
    } finally { process.chdir(originalCwd); rmSync(root, { recursive: true, force: true }); }
  });

  it("covers alias-only, multi-alias, fallback, abstract, and non-agent injection", async () => {
    const root = join(import.meta.dirname, "build", `alias-coverage-${Math.random().toString(36).slice(2)}`);
    const defaults = join(root, "defaults"); const bundled = join(defaults, "agents"); const project = join(root, "project"); const out = join(root, "out");
    mkdirSync(join(root, ".md-merger"), { recursive: true }); mkdirSync(join(bundled, "base"), { recursive: true }); mkdirSync(join(project, "user"), { recursive: true });
    writeFileSync(join(bundled, "base", "concrete.md"), "---\ntype: agent\nextends: [base] \n---\nInherited concrete prompt.");
    writeFileSync(join(bundled, "base.md"), "---\ntype: agent\nabstract: true\n---\nInherited base.");
    writeFileSync(join(bundled, "base", "multi.md"), "---\ntype: agent\n---\nMulti alias prompt.");
    writeFileSync(join(bundled, "skill.md"), "---\ntype: skill\n---\nSkill prompt.");
    writeFileSync(join(project, "user", "concrete.md"), "---\ntype: agent\n---\nProject concrete prompt.");
    writeFileSync(join(project, "user", "fallback.md"), "---\ntype: agent\n---\nFallback prompt.");
    writeFileSync(join(bundled, "md-merger-root.yaml"), "exports:\n  concrete-alias: base/concrete.md\n  first: base/multi.md\n  second: base/multi.md\n  hidden: base.md\n  skill-alias: skill.md\n");
    writeFileSync(join(project, "md-merger-root.yaml"), "exports:\n  concrete-alias: user/concrete.md\n");
    writeFileSync(join(root, ".md-merger", "config.yaml"), `project: test\nstoreFile: ${join(root, "store.jsonl")}\nemitDirs:\n  agent: ${out}\nrootDirs:\n  - ${project}\n`);
    process.env.MD_MERGER_CONFIG = join(root, ".md-merger", "config.yaml");
    try {
      const hooks = await (await import("../src/index")).createMdMergerPlugin(defaults)({ directory: root } as any);
      const config: Record<string, unknown> = {}; await (hooks as any).config(config); const agents = config.agent as Record<string, { prompt: string }>;
      expect(Object.keys(agents).sort()).toEqual(["concrete-alias", "first", "second", "base/concrete", "user/fallback"].sort());
      expect(agents["concrete-alias"]?.prompt).toContain("Project concrete prompt."); expect(agents["concrete-alias"]?.prompt).not.toContain("Inherited concrete prompt.");
      expect(agents["base/concrete"]?.prompt).toContain("Inherited concrete prompt.");
      expect(agents.first?.prompt).toContain("Multi alias prompt."); expect(agents.second?.prompt).toBe(agents.first?.prompt);
      expect(agents["user/fallback"]?.prompt).toContain("Fallback prompt.");
      expect(agents.hidden).toBeUndefined(); expect(agents["skill-alias"]).toBeUndefined();
    } finally { process.chdir(originalCwd); rmSync(root, { recursive: true, force: true }); }
  });

  it("handles an invalid root export at the plugin boundary", async () => {
    const root = join(import.meta.dirname, "build", `invalid-root-export-${Math.random().toString(36).slice(2)}`);
    const defaults = join(root, "defaults"); const project = join(root, "project"); const out = join(root, "out");
    const configPath = join(root, "config.yaml");
    mkdirSync(join(defaults, "agents"), { recursive: true }); mkdirSync(project, { recursive: true });
    writeFileSync(join(project, "md-merger-root.yaml"), "exports:\n  missing: absent.md\n");
    writeFileSync(configPath, `project: test\nstoreFile: ${join(root, "store.jsonl")}\nemitDirs:\n  agent: ${out}\nrootDirs:\n  - ${project}\n`);
    process.env.MD_MERGER_CONFIG = configPath; const cwd = process.cwd();
    try {
      const hooks = await (await import("../src/index")).createMdMergerPlugin(defaults)({ directory: root } as any);
      expect(hooks).toEqual({}); expect(process.cwd()).toBe(cwd); expect(process.env.MD_MERGER_CONFIG).toBe(configPath); expect(existsSync(out)).toBe(false);
    } finally { process.chdir(originalCwd); rmSync(root, { recursive: true, force: true }); }
  });

  it("gives an exported alias precedence over a colliding canonical fallback key", async () => {
    const root = join(import.meta.dirname, "build", `alias-collision-${Math.random().toString(36).slice(2)}`);
    const defaults = join(root, "defaults"); const source = join(defaults, "agents"); const out = join(root, "out");
    mkdirSync(join(root, ".md-merger"), { recursive: true }); mkdirSync(join(source, "target"), { recursive: true });
    writeFileSync(join(source, "target", "concrete.md"), "---\ntype: agent\n---\nExported target prompt.");
    writeFileSync(join(source, "shared.md"), "---\ntype: agent\n---\nUnexported fallback prompt.");
    writeFileSync(join(source, "md-merger-root.yaml"), "exports:\n  shared: target/concrete.md\n");
    writeFileSync(join(root, ".md-merger", "config.yaml"), `project: test\nstoreFile: ${join(root, "store.jsonl")}\nemitDirs:\n  agent: ${out}\nrootDirs: []\n`);
    delete process.env.MD_MERGER_CONFIG;
    try {
      const hooks = await (await import("../src/index")).createMdMergerPlugin(defaults)({ directory: root } as any);
      const config: Record<string, unknown> = {}; await (hooks as any).config(config);
      const agents = config.agent as Record<string, { prompt: string }>;
      expect(agents.shared?.prompt).toContain("Exported target prompt.");
      expect(agents.shared?.prompt).not.toContain("Unexported fallback prompt.");
      expect(agents["target/concrete"]).toBeUndefined();
    } finally { process.chdir(originalCwd); rmSync(root, { recursive: true, force: true }); }
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

  it("does not inject skills emitted beneath the agent route", async () => {
    const root = join(import.meta.dirname, "build", `overlap-${Math.random().toString(36).slice(2)}`);
    const defaults = join(root, "defaults");
    const source = join(root, "source");
    const out = join(root, "out");
    mkdirSync(join(root, ".md-merger"), { recursive: true });
    mkdirSync(source, { recursive: true });
    writeFileSync(join(source, "worker.md"), "---\ntype: agent\nabstract: false\n---\n## Role\nWorker.");
    writeFileSync(join(source, "helper.md"), "---\ntype: skill\nabstract: false\n---\n## Role\nHelper.");
    writeFileSync(join(root, ".md-merger", "config.yaml"), `project: test\nstoreFile: ${join(root, "store.jsonl")}\nemitDirs:\n  agent: ${out}\n  skill: ${join(out, "skills")}\nrootDirs:\n  - ${source}\n`);
    process.env.MD_MERGER_CONFIG = join(root, ".md-merger", "config.yaml");
    try {
      const hooks = await (await import("../src/index")).createMdMergerPlugin(defaults)({ directory: root } as any);
      const opencodeConfig: Record<string, unknown> = {};
      await (hooks as any).config(opencodeConfig);
      expect(existsSync(join(out, "worker.md"))).toBe(true);
      expect(existsSync(join(out, "skills", "helper.md"))).toBe(true);
      expect((opencodeConfig.agent as any).worker.prompt).toContain("Worker.");
      expect((opencodeConfig.agent as any)["skills/helper"]).toBeUndefined();
    } finally {
      process.chdir(originalCwd);
      rmSync(root, { recursive: true, force: true });
    }
  });
});

const originalCwd = process.cwd();
const originalConfig = process.env.MD_MERGER_CONFIG;
