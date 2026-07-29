import { describe, test, expect, beforeEach, afterEach, spyOn } from "bun:test";
import { mkdirSync, rmSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { emitAll, renderText } from "@md-merger/emit";
import { updateOrCreate, findLatest } from "@md-merger/store";
import type { Config } from "@md-merger/types";

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
