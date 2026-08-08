import { describe, test, expect, beforeEach, afterEach, spyOn } from "bun:test";
import { mkdirSync, rmSync, readFileSync, existsSync, writeFileSync, readdirSync } from "node:fs";
import { join, resolve, dirname, basename } from "node:path";
import { emitAll, emitAllWithMetadata, renderText } from "@md-merger/emit";
import { updateOrCreate, findLatest, readStore } from "@md-merger/store";
import type { Config } from "@md-merger/types";
import { build } from "../../src/import";
import { DEFAULT_CONFIG } from "../../src/types";

const baseTempDir = join(import.meta.dirname, "..", "build", "tmp");
const testDir = join(baseTempDir, "evo-test-emit-" + Math.random().toString(36).slice(2));
const storePath = join(testDir, "store.jsonl");
const emitDir = join(testDir, "output");

beforeEach(() => {
  mkdirSync(testDir, { recursive: true });
});
afterEach(() => {
  rmSync(testDir, { recursive: true, force: true });
});

describe("renderText", () => {
  test("renders frontmatter and sections as markdown", async () => {
    await updateOrCreate(storePath, "base", "test", {
      sections: [{ name: "role", body: "You are helpful." }],
      frontmatter: { name: "Base Agent", mode: "subagent" },
    });
    const output = await renderText(storePath, "base", 5);
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
    const output = await renderText(storePath, "child", 5);
    expect(output).not.toContain("extends");
  });

  test("strips abstract from output frontmatter", async () => {
    await updateOrCreate(storePath, "base", "test", {
      abstract: true,
      sections: [{ name: "role", body: "base" }],
      frontmatter: { name: "Base", abstract: true },
    });
    const output = await renderText(storePath, "base", 5);
    expect(output).not.toContain("abstract");
  });

  test("strips type from output frontmatter", async () => {
    await updateOrCreate(storePath, "typed-base", "test", {
      type: "skill",
      sections: [{ name: "role", body: "You are helpful." }],
      frontmatter: { name: "Typed Agent", type: "skill" },
      abstract: false,
    });
    const output = await renderText(storePath, "typed-base", 5);
    expect(output).not.toContain("type:");
    expect(output).toContain("## Role");
  });

  test("has exactly one blank line between child body and sibling section", async () => {
    // The compounding bug manifests at:
    // 1) Last child → next sibling child (within same parent)
    // 2) Last child → next top-level section (after parent returns)
    // Childless sections and parent→first-child are NOT affected.
    await updateOrCreate(storePath, "compounding-bug", "test", {
      sections: [
        { name: "role", body: "You are a coding assistant.", level: 1, children: [
          { name: "identity", body: "I am an AI.", level: 2 },
          { name: "behavior", body: "Be helpful.", level: 2 },
        ]},
        { name: "constraints", body: "Think carefully.", level: 1 },
      ],
      frontmatter: {},
    });
    const output = await renderText(storePath, "compounding-bug", 5);
    // Between child1 and child2: exactly \n\n — not \n\n\n or more
    expect(output).toMatch(/I am an AI\.\n\n### Behavior/);
    expect(output).not.toMatch(/AI\.\n\n\n/);
    // Between last child of parent and next sibling section: exactly \n\n
    expect(output).toMatch(/helpful\.\n\n## Constraints/);
    expect(output).not.toMatch(/helpful\.\n\n\n/);
    // Output must not end with trailing blank lines
    expect(output).not.toMatch(/\n\n+$/);
  });

  test('no trailing blank lines at end of output', async () => {
    await updateOrCreate(storePath, "trailing-newline", "test", {
      sections: [
        { name: "role", body: "You are helpful." },
      ],
      frontmatter: {},
    });
    const output = await renderText(storePath, "trailing-newline", 5);
    expect(output).not.toMatch(/\n\n+$/);
    // Should end with a single newline
    expect(output).toMatch(/helpful\.\n$/);
  });

  test('deeply nested sections maintain correct spacing at child boundaries', async () => {
    await updateOrCreate(storePath, "deep-nested", "test", {
      sections: [{ name: "root", body: "Root.", level: 1, children: [
        { name: "child-one", body: "Child one.", level: 2, children: [
          { name: "grandchild-a", body: "Grandchild A.", level: 3 },
          { name: "grandchild-b", body: "Grandchild B.", level: 3 },
        ]},
        { name: "child-two", body: "Child two.", level: 2 },
      ]}],
      frontmatter: {},
    });
    const output = await renderText(storePath, "deep-nested", 5);
    // Between grandchild A and grandchild B (siblings within child-one): exactly \n\n
    expect(output).toMatch(/Grandchild A\.\n\n#### Grandchild B/);
    expect(output).not.toMatch(/Grandchild A\.\n\n\n/);
    // Between child-one last descendant and child-two: exactly \n\n
    expect(output).toMatch(/Grandchild B\.\n\n### Child Two/);
    expect(output).not.toMatch(/Grandchild B\.\n\n\n/);
    // Verify all sections present
    expect(output).toContain("## Root");
    expect(output).toContain("### Child One");
    expect(output).toContain("#### Grandchild A");
    expect(output).toContain("#### Grandchild B");
    expect(output).toContain("### Child Two");
  });

  test("renders nested sections with correct heading levels", async () => {
    await updateOrCreate(storePath, "nested", "test", {
      sections: [{ name: "role", body: "Intro.", level: 1, children: [
        { name: "identity", body: "I am an AI.", level: 2 },
        { name: "behavior", body: "Be helpful.", level: 2 },
      ]}],
      frontmatter: { name: "Nested Agent" },
    });
    const output = await renderText(storePath, "nested", 5);
    expect(output).toContain("### Identity");
    expect(output).not.toMatch(/^  /m);
  });

  test("handles empty sections array gracefully", async () => {
    await updateOrCreate(storePath, "empty-sections", "test", {
      sections: [],
      frontmatter: { name: "Empty Agent" },
    });
    const output = await renderText(storePath, "empty-sections", 5);
    expect(output).toContain("---");
    expect(output).toContain("name: Empty Agent");
    // No section bodies rendered
    expect(output).not.toMatch(/^## /m);
  });
});

describe("emitAll", () => {
  test("reconciles an empty store and removes only trusted stale outputs", async () => {
    const outputRoot = join(testDir, "empty-output");
    mkdirSync(outputRoot, { recursive: true });
    const stale = join(outputRoot, "stale.md");
    const unknown = join(outputRoot, "keep.txt");
    writeFileSync(stale, "stale");
    writeFileSync(unknown, "user");
    writeFileSync(`${storePath}.outputs.json`, JSON.stringify({ version: 1, roots: [resolve(outputRoot)], files: [resolve(stale)] }));
    await emitAll(storePath, { agent: outputRoot }, { ...DEFAULT_CONFIG, project: "test", version: "1", storeFile: storePath }, false);
    expect(existsSync(stale)).toBe(false);
    expect(existsSync(unknown)).toBe(true);
    expect(JSON.parse(readFileSync(`${storePath}.outputs.json`, "utf8"))).toEqual({ version: 1, roots: [resolve(outputRoot)], files: [] });
  });

  test("writes an absolute manifest and preserves unknown files during lifecycle cleanup", async () => {
    const input = join(testDir, "lifecycle-input");
    const outputRoot = join(testDir, "lifecycle-output");
    mkdirSync(input, { recursive: true });
    mkdirSync(outputRoot, { recursive: true });
    writeFileSync(join(input, "old.md"), "---\ntype: agent\n---\n## Role\nOld.");
    await build([input], storePath, "test");
    writeFileSync(join(outputRoot, "keep-me.txt"), "user");
    await emitAll(storePath, { agent: outputRoot }, { ...DEFAULT_CONFIG, project: "test", version: "1", storeFile: storePath }, false);
    rmSync(join(input, "old.md")); mkdirSync(join(input, "nested"));
    writeFileSync(join(input, "nested", "new.md"), "---\ntype: agent\n---\n## Role\nNew.");
    await build([input], storePath, "test");
    await emitAll(storePath, { agent: outputRoot }, { ...DEFAULT_CONFIG, project: "test", version: "1", storeFile: storePath }, false);
    const manifest = JSON.parse(readFileSync(`${storePath}.outputs.json`, "utf8")) as { version: number; roots: string[]; files: string[] };
    expect(manifest.version).toBe(1);
    expect(manifest.roots).toEqual([resolve(outputRoot)]);
    expect(manifest.files).toEqual([resolve(outputRoot, "nested", "new.md")]);
    expect(existsSync(join(outputRoot, "old.md"))).toBe(false);
    expect(existsSync(join(outputRoot, "nested", "new.md"))).toBe(true);
    expect(existsSync(join(outputRoot, "keep-me.txt"))).toBe(true);
  });

  test("manifest transaction preserves bytes, cause, and temp cleanup", async () => {
    const outputRoot = join(testDir, "manifest-failure-output"); mkdirSync(outputRoot, { recursive: true });
    await updateOrCreate(storePath, "one", "test", { sections: [{ name: "role", body: "one" }], frontmatter: {}, status: "active", abstract: false, type: "agent" });
    const manifestPath = `${storePath}.outputs.json`; writeFileSync(manifestPath, '{"version":1,"roots":[],"files":[]}\n');
    const before = readFileSync(manifestPath); const sentinel = new Error("sentinel");
    const ops = { writeFileSync, renameSync: () => { throw sentinel; } };
    try { await emitAllWithMetadata(storePath, { agent: outputRoot }, { ...DEFAULT_CONFIG, project: "test", version: "1", storeFile: storePath }, false, ops); throw new Error("expected failure"); }
    catch (error) { const failure = error as Error & { cause?: unknown }; expect(failure.message).toContain(`Failed to write managed output manifest "${manifestPath}"`); expect(failure.cause).toBe(sentinel); }
    expect(readFileSync(manifestPath)).toEqual(before);
    expect(readdirSync(dirname(manifestPath)).some((name) => name.startsWith(`.${basename(manifestPath)}.`) && name.endsWith(".tmp"))).toBe(false);
  });

  test("retains failed current output and continues emitting other modules", async () => {
    const outputRoot = join(testDir, "failure-output");
    await updateOrCreate(storePath, "broken", "test", { sections: [{ name: "role", body: "broken" }], frontmatter: {}, status: "active", abstract: false, type: "agent" });
    await updateOrCreate(storePath, "good", "test", { sections: [{ name: "role", body: "good" }], frontmatter: {}, status: "active", abstract: false, type: "agent" });
    mkdirSync(outputRoot, { recursive: true });
    const brokenPath = join(outputRoot, "broken.md");
    mkdirSync(brokenPath, { recursive: true });
    writeFileSync(`${storePath}.outputs.json`, JSON.stringify({ version: 1, roots: [resolve(outputRoot)], files: [resolve(brokenPath)] }));
    const paths = await emitAll(storePath, { agent: outputRoot }, { ...DEFAULT_CONFIG, project: "test", version: "1", storeFile: storePath }, false);
    expect(paths).toContain(resolve(join(outputRoot, "good.md")));
    expect(existsSync(brokenPath)).toBe(true);
    const nextManifest = JSON.parse(readFileSync(`${storePath}.outputs.json`, "utf8")) as { files: string[] };
    expect([...nextManifest.files].sort()).toEqual([resolve(brokenPath), resolve(outputRoot, "good.md")].sort());
  });

  test("dry-run preserves output and manifest bytes without temporary manifests", async () => {
    const outputRoot = join(testDir, "dry-output");
    await updateOrCreate(storePath, "dry", "test", { sections: [{ name: "role", body: "dry" }], frontmatter: {}, status: "active", abstract: false, type: "agent" });
    mkdirSync(outputRoot, { recursive: true });
    const output = join(outputRoot, "dry.md");
    const manifestPath = `${storePath}.outputs.json`;
    writeFileSync(output, "before");
    writeFileSync(manifestPath, JSON.stringify({ version: 1, roots: [resolve(outputRoot)], files: [resolve(output)] }));
    const beforeOutput = readFileSync(output); const beforeManifest = readFileSync(manifestPath);
    await emitAll(storePath, { agent: outputRoot }, { ...DEFAULT_CONFIG, project: "test", version: "1", storeFile: storePath }, true);
    expect(readFileSync(output)).toEqual(beforeOutput);
    expect(readFileSync(manifestPath)).toEqual(beforeManifest);
    expect(readdirSync(testDir).some((name) => name.startsWith("store.jsonl.outputs.json.") && name.endsWith(".tmp"))).toBe(false);
  });

  test("retains a previously managed output when rendering fails", async () => {
    const outputRoot = join(testDir, "render-failure-output");
    mkdirSync(outputRoot, { recursive: true });
    const prior = join(outputRoot, "broken.md");
    writeFileSync(prior, "prior bytes");
    writeFileSync(`${storePath}.outputs.json`, JSON.stringify({ version: 1, roots: [resolve(outputRoot)], files: [resolve(prior)] }));
    await updateOrCreate(storePath, "broken", "test", { sections: [{ name: "role", body: "broken" }], frontmatter: {}, status: "active", abstract: false, type: "agent" });
    await emitAll(storePath, { agent: outputRoot }, { ...DEFAULT_CONFIG, project: "test", version: "1", maxInheritDepth: 0, storeFile: storePath }, false);
    expect(readFileSync(prior, "utf8")).toBe("prior bytes");
    const manifest = JSON.parse(readFileSync(`${storePath}.outputs.json`, "utf8")) as { files: string[] };
    const retainedPath = resolve(prior);
    expect(manifest.files).toEqual([retainedPath]);
  });

  test("rejects stale deletion failure with path and preserves manifest", async () => {
    const outputRoot = join(testDir, "delete-failure-output");
    mkdirSync(outputRoot, { recursive: true });
    const stale = join(outputRoot, "stale.md");
    mkdirSync(stale);
    const priorManifest = JSON.stringify({ version: 1, roots: [resolve(outputRoot)], files: [resolve(stale)] });
    writeFileSync(`${storePath}.outputs.json`, priorManifest);
    try {
      await emitAll(storePath, { agent: outputRoot }, { ...DEFAULT_CONFIG, project: "test", version: "1", storeFile: storePath }, false);
      throw new Error("expected stale deletion failure");
    } catch (error) {
      expect(error).toBeInstanceOf(Error);
      const failure = error as Error & { cause?: unknown };
      expect(failure.message).toContain(`Failed to remove stale managed output "${stale}":`);
      const cause = failure.cause as NodeJS.ErrnoException;
      expect(["EFAULT", "EPERM", "EISDIR"]).toContain(cause.code ?? "");
    }
    expect(readFileSync(`${storePath}.outputs.json`, "utf8")).toBe(priorManifest);
  });

  test("does not trust root entries or unsafe prior files for deletion", async () => {
    const outputRoot = join(testDir, "safe-output"); const outside = join(testDir, "outside.md");
    mkdirSync(outputRoot, { recursive: true }); writeFileSync(outside, "safe");
    const manifestPath = `${storePath}.outputs.json`;
    writeFileSync(manifestPath, JSON.stringify({ version: 1, roots: [resolve(outputRoot)], files: [resolve(outputRoot), resolve(outside)] }));
    await emitAll(storePath, { agent: outputRoot }, { ...DEFAULT_CONFIG, project: "test", version: "1", storeFile: storePath }, false);
    expect(existsSync(outputRoot)).toBe(true); expect(existsSync(outside)).toBe(true);
    expect(JSON.parse(readFileSync(manifestPath, "utf8")).files).toEqual([]);
  });

  test("handles default/user root export override chains", async () => {
    const defaultsRoot = join(testDir, "defaults");
    const userRoot = join(testDir, "user");
    const outputRoot = join(testDir, "override-output");
    mkdirSync(join(defaultsRoot, "base"), { recursive: true });
    mkdirSync(join(userRoot, "user"), { recursive: true });

    writeFileSync(join(defaultsRoot, "base", "base-agent.md"), `---\ntype: agent\nabstract: true\n---\n## Description\nThis is the base agent.`);
    writeFileSync(join(defaultsRoot, "base", "base-orchestrator.md"), `---\ntype: agent\nextends: [base/base-agent.md]\nabstract: true\n---\n## Description\nThis is the abstract base orchestrator.\n\n## Role\nOrchestrator.`);
    writeFileSync(join(defaultsRoot, "base", "orchestrator.md"), `---\ntype: agent\nextends: [base-orchestrator]\nabstract: false\n---\n## Description\nThis is the concrete base orchestrator.`);
    writeFileSync(join(defaultsRoot, "md-merger-root.yaml"), "exports:\n  base-orchestrator: base/base-orchestrator.md\n");
    writeFileSync(join(userRoot, "user", "base-orchestrator.md"), `---\ntype: agent\nextends: [base/base-orchestrator.md]\nabstract: true\n---\n## Description\nThis is the user's abstract base orchestrator.\n\n## Subrole\nUser Orchestrator.`);
    writeFileSync(join(userRoot, "md-merger-root.yaml"), "exports:\n  base-orchestrator: user/base-orchestrator.md\n");

    await build([defaultsRoot, userRoot], storePath, "override-project");
    const config: Config = {
      project: "override-project",
      version: "1",
      maxInheritDepth: 5,
      storeFile: storePath,
      emitDirs: { agent: outputRoot },
      rootDirs: [{ path: defaultsRoot, optional: false }, { path: userRoot, optional: false }],
    };
    const written = await emitAll(storePath, config.emitDirs, config, false);

    expect(written).toEqual([join(outputRoot, "base", "orchestrator.md")]);
    const output = readFileSync(join(outputRoot, "base", "orchestrator.md"), "utf-8");
    expect(output).toContain("This is the concrete base orchestrator.");
    expect(output).toContain("Orchestrator.");
    expect(output).toContain("User Orchestrator.");
    expect(output).not.toContain("This is the abstract base orchestrator.");
    expect(output).not.toContain("This is the user's abstract base orchestrator.");
    expect(written.some((path) => path.includes("base-agent") || path.includes("base-orchestrator"))).toBe(false);

    const concrete = await findLatest(storePath, "base/orchestrator");
    expect(concrete?.extends).toEqual(["user/base-orchestrator"]);
    const storedNames = (await readStore(storePath)).map((record) => record.name);
    expect(storedNames).toContain("user/base-orchestrator");
    expect(storedNames).toContain("base/base-orchestrator");
    expect((await findLatest(storePath, "user/base-orchestrator"))?.extends).toEqual(["base/base-orchestrator"]);
    expect((await findLatest(storePath, "base/base-orchestrator"))?.extends).toEqual(["base/base-agent"]);
  });

  test("emits nested module paths under the type route and skips abstract modules", async () => {
    const inputRoot = join(testDir, "input");
    const outputRoot = join(testDir, "out-nested");
    mkdirSync(join(inputRoot, "base", "core"), { recursive: true });
    writeFileSync(join(inputRoot, "base", "BasePrimaryAgent.md"), "---\ntype: agent\nabstract: true\n---\n## Role\nBase primary content.");
    writeFileSync(join(inputRoot, "base", "core", "plan-o-strator.md"), "---\ntype: agent\nextends: [base/BasePrimaryAgent]\nabstract: false\n---\n## Role\nConcrete orchestration content.");
    await build([inputRoot], storePath, "test-project");
    const config: Config = { project: "test-project", version: "1", maxInheritDepth: 5, storeFile: storePath, emitDirs: { agent: outputRoot }, rootDirs: [{ path: inputRoot, optional: false }] };
    const written = await emitAll(storePath, config.emitDirs, config, false);
    expect(written).toContain(join(outputRoot, "base", "core", "plan-o-strator.md"));
    expect(written.some((p) => p.includes("BasePrimaryAgent"))).toBe(false);
    expect(existsSync(join(outputRoot, "base", "core", "plan-o-strator.md"))).toBe(true);
    expect(existsSync(join(outputRoot, "base_core_plan-o-strator.md"))).toBe(false);
  });

  test("default config routes agent and skill types to .opencode directories", () => {
    expect(DEFAULT_CONFIG.emitDirs.agent).toBe(".opencode/agents");
    expect(DEFAULT_CONFIG.emitDirs.skill).toBe(".opencode/skills");
  });
  test("writes merged markdown files", async () => {
    await updateOrCreate(storePath, "base", "test", {
      sections: [{ name: "role", body: "You are helpful." }],
      frontmatter: { name: "Base" },
      status: "active" as const,
      abstract: false,
      type: "agent",
    });
    const config: Config = {
      project: "test",
      version: "1",
      maxInheritDepth: 5,
      storeFile: "store.jsonl",
      emitDirs: { agent: emitDir },
      rootDirs: [],
    };
    const paths = await emitAll(storePath, config.emitDirs, config, false);
    expect(paths.length).toBeGreaterThan(0);
    expect(readFileSync(join(emitDir, "base.md"), "utf-8")).toContain("## Role");
  });

  test("skips abstract modules", async () => {
    await updateOrCreate(storePath, "abstract-base", "test", {
      sections: [{ name: "role", body: "abstract" }],
      frontmatter: {},
      status: "active" as const,
      abstract: true,
      type: "agent",
    });
    const config: Config = {
      project: "test",
      version: "1",
      maxInheritDepth: 5,
      storeFile: "store.jsonl",
      emitDirs: { agent: emitDir },
      rootDirs: [],
    };
    const paths = await emitAll(storePath, config.emitDirs, config, false);
    expect(paths.length).toBe(0);
  });

  test("routes modules by type to correct emit dir", async () => {
    const skillDir = join(testDir, "skills");
    const agentDir = join(testDir, "agents");

    await updateOrCreate(storePath, "skill-mod", "test", {
      sections: [{ name: "role", body: "Skill module." }],
      frontmatter: {},
      status: "active" as const,
      abstract: false,
      type: "skill",
    });

    await updateOrCreate(storePath, "agent-mod", "test", {
      sections: [{ name: "role", body: "Agent module." }],
      frontmatter: {},
      status: "active" as const,
      abstract: false,
      type: "agent",
    });

    const config: Config = {
      project: "test",
      version: "1",
      maxInheritDepth: 5,
      storeFile: "store.jsonl",
      emitDirs: { skill: skillDir, agent: agentDir },
      rootDirs: [],
    };

    const paths = await emitAll(storePath, config.emitDirs, config, false);
    expect(paths.length).toBe(2);
    expect(readFileSync(join(skillDir, "skill-mod.md"), "utf-8")).toContain("## Role");
    expect(readFileSync(join(agentDir, "agent-mod.md"), "utf-8")).toContain("## Role");
  });

  test("skips modules without type", async () => {
    await updateOrCreate(storePath, "no-type-mod", "test", {
      sections: [{ name: "role", body: "No type." }],
      frontmatter: {},
      status: "active" as const,
      abstract: false,
    });

    const config: Config = {
      project: "test",
      version: "1",
      maxInheritDepth: 5,
      storeFile: "store.jsonl",
      emitDirs: { agent: join(testDir, "agentout") },
      rootDirs: [],
    };

    const paths = await emitAll(storePath, config.emitDirs, config, false);
    expect(paths.length).toBe(0);
  });

  test("warns and skips modules with unknown type", async () => {
    await updateOrCreate(storePath, "unknown-type-mod", "test", {
      sections: [{ name: "role", body: "Unknown type." }],
      frontmatter: {},
      status: "active" as const,
      abstract: false,
      type: "widget",
    });

    const config: Config = {
      project: "test",
      version: "1",
      maxInheritDepth: 5,
      storeFile: "store.jsonl",
      emitDirs: { agent: join(testDir, "agentout") },
      rootDirs: [],
    };

    const stderrSpy = spyOn(console, "error").mockImplementation(() => {});
    const paths = await emitAll(storePath, config.emitDirs, config, false);
    expect(paths.length).toBe(0);
    expect(stderrSpy).toHaveBeenCalledWith(
      expect.stringContaining("No emit dir configured for type \"widget\"")
    );
    stderrSpy.mockRestore();
  });

  test("skips abstract module even when type is present", async () => {
    await updateOrCreate(storePath, "abstract-typed", "test", {
      sections: [{ name: "role", body: "Abstract typed." }],
      frontmatter: {},
      status: "active" as const,
      abstract: true,
      type: "agent",
    });

    const config: Config = {
      project: "test",
      version: "1",
      maxInheritDepth: 5,
      storeFile: "store.jsonl",
      emitDirs: { agent: join(testDir, "agentout") },
      rootDirs: [],
    };

    const paths = await emitAll(storePath, config.emitDirs, config, false);
    expect(paths.length).toBe(0);
  });

  test("preserves type field across update builds", async () => {
    // First build — create with type
    await updateOrCreate(storePath, "persist-type", "test", {
      sections: [{ name: "role", body: "Initial." }],
      frontmatter: { type: "skill" },
      status: "active" as const,
      abstract: false,
      type: "skill",
    });

    // Second build — update sections but keep same type in frontmatter
    await updateOrCreate(storePath, "persist-type", "test", {
      sections: [{ name: "role", body: "Updated." }],
      frontmatter: { type: "skill" },
      status: "active" as const,
      abstract: false,
      type: "skill",
    });

    const record = await findLatest(storePath, "persist-type");
    expect(record?.type).toBe("skill");
  });

  test("preserves existing type when re-import omits type from frontmatter", async () => {
    // First import — create with type
    await updateOrCreate(storePath, "preserve-type", "test", {
      sections: [{ name: "role", body: "Initial." }],
      frontmatter: { type: "skill" },
      status: "active" as const,
      abstract: false,
      type: "skill",
    });

    // Second import — update with type: undefined (frontmatter had no type)
    await updateOrCreate(storePath, "preserve-type", "test", {
      sections: [{ name: "role", body: "Updated." }],
      frontmatter: {},
      extends: undefined,
      abstract: false,
      // type intentionally omitted from patch
    });

    const record = await findLatest(storePath, "preserve-type");
    expect(record?.type).toBe("skill"); // type should be preserved
  });
});
