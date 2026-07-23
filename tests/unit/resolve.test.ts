import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { mergeSections, resolve, topologicalSort } from "@evo/resolve";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Section } from "@evo/types";
import { updateOrCreate } from "@evo/store";

const baseTempDir = join(import.meta.dirname, "..", "build", "tmp");
const testDir = join(baseTempDir, "evo-test-resolve-" + Math.random().toString(36).slice(2));
let storePath: string;

beforeEach(() => {
  mkdirSync(testDir, { recursive: true });
  storePath = join(testDir, "store.jsonl");
});
afterEach(() => {
  rmSync(testDir, { recursive: true, force: true });
});

describe("mergeSections", () => {
  test("overrides same-named sections", () => {
    const parent: Section[] = [{ name: "role", body: "parent role" }];
    const child: Section[] = [{ name: "role", body: "child role" }];
    const result = mergeSections(parent, child);
    expect(result[0]!.body).toBe("child role");
  });

  test("appends new sections", () => {
    const parent: Section[] = [{ name: "role", body: "role" }];
    const child: Section[] = [{ name: "constraints", body: "no pushing" }];
    const result = mergeSections(parent, child);
    expect(result).toHaveLength(2);
    expect(result[1]!.name).toBe("constraints");
  });

  test("removes sections with empty body", () => {
    const parent: Section[] = [{ name: "role", body: "role" }, { name: "constraints", body: "no" }];
    const child: Section[] = [{ name: "constraints", body: "" }];
    const result = mergeSections(parent, child);
    expect(result).toHaveLength(1);
    expect(result[0]!.name).toBe("role");
  });

  test("overrides ### subsection, siblings carry over", () => {
    const parent: Section[] = [{ name: "role", body: "role intro", level: 1, children: [
      { name: "identity", body: "parent identity", level: 2 },
      { name: "behavior", body: "parent behavior", level: 2 },
    ]}];
    const child: Section[] = [{ name: "role", body: "child role", level: 1, children: [
      { name: "identity", body: "child identity", level: 2 },
    ]}];
    const result = mergeSections(parent, child);
    expect(result[0]!.body).toBe("child role");
    expect(result[0]!.children).toHaveLength(2);
    expect(result[0]!.children![0]!.body).toBe("child identity");
    expect(result[0]!.children![1]!.body).toBe("parent behavior");
  });

  test("removes ### with empty body and no children", () => {
    const parent: Section[] = [{ name: "role", body: "intro", level: 1, children: [
      { name: "identity", body: "id", level: 2 },
      { name: "behavior", body: "behav", level: 2 },
    ]}];
    const child: Section[] = [{ name: "role", body: "", level: 1, children: [
      { name: "identity", body: "", level: 2 },
    ]}];
    const result = mergeSections(parent, child);
    expect(result[0]!.children).toHaveLength(1);
    expect(result[0]!.children![0]!.name).toBe("behavior");
  });

  test("empty body WITH children does NOT remove", () => {
    const parent: Section[] = [{ name: "role", body: "", level: 1, children: [
      { name: "identity", body: "parent id", level: 2, children: [
        { name: "primary", body: "parent primary", level: 3 },
      ]},
    ]}];
    const child: Section[] = [{ name: "role", body: "", level: 1, children: [
      { name: "identity", body: "", level: 2, children: [
        { name: "primary", body: "child primary", level: 3 },
      ]},
    ]}];
    const result = mergeSections(parent, child);
    expect(result[0]!.children![0]!.body).toBe("parent id");
    expect(result[0]!.children![0]!.children![0]!.body).toBe("child primary");
  });

  test("grandchild removal cascades", () => {
    const parent: Section[] = [{ name: "role", body: "", level: 1, children: [
      { name: "identity", body: "id", level: 2, children: [
        { name: "primary", body: "p", level: 3 },
        { name: "secondary", body: "s", level: 3 },
      ]},
    ]}];
    const child: Section[] = [{ name: "role", body: "", level: 1, children: [
      { name: "identity", body: "", level: 2 },
    ]}];
    const result = mergeSections(parent, child);
    expect(result[0]!.children).toHaveLength(0);
  });

  test("adds new ###, parent children carry over", () => {
    const parent: Section[] = [{ name: "role", body: "intro", level: 1, children: [
      { name: "identity", body: "id", level: 2 },
    ]}];
    const child: Section[] = [{ name: "role", body: "", level: 1, children: [
      { name: "capabilities", body: "can help", level: 2 },
    ]}];
    const result = mergeSections(parent, child);
    expect(result[0]!.children).toHaveLength(2);
    expect(result[0]!.children![1]!.name).toBe("capabilities");
  });

  test("deep nesting: override at #### level 3", () => {
    const parent: Section[] = [{ name: "role", body: "", level: 1, children: [
      { name: "identity", body: "parent id", level: 2, children: [
        { name: "primary", body: "parent primary", level: 3 },
        { name: "secondary", body: "parent secondary", level: 3 },
      ]},
    ]}];
    const child: Section[] = [{ name: "role", body: "", level: 1, children: [
      { name: "identity", body: "child id", level: 2, children: [
        { name: "primary", body: "child primary", level: 3 },
      ]},
    ]}];
    const result = mergeSections(parent, child);
    const id = result[0]!.children![0]!;
    expect(id.body).toBe("child id");
    expect(id.children).toHaveLength(2);
    expect(id.children![0]!.body).toBe("child primary");
    expect(id.children![1]!.body).toBe("parent secondary");
  });

  test("cross-level override: child ## Role body + ### Identity body, parent ### Behavior carries over", () => {
    const parent: Section[] = [{ name: "role", body: "parent role", level: 1, children: [
      { name: "identity", body: "parent identity", level: 2 },
      { name: "behavior", body: "parent behavior", level: 2 },
    ]}];
    const child: Section[] = [{ name: "role", body: "child role", level: 1, children: [
      { name: "identity", body: "child identity", level: 2 },
    ]}];
    const result = mergeSections(parent, child);
    expect(result[0]!.body).toBe("child role");
    expect(result[0]!.children).toHaveLength(2);
    expect(result[0]!.children![0]!.name).toBe("identity");
    expect(result[0]!.children![0]!.body).toBe("child identity");
    expect(result[0]!.children![1]!.name).toBe("behavior");
    expect(result[0]!.children![1]!.body).toBe("parent behavior");
  });
});

describe("resolve", () => {
  test("resolves leaf module with no extends", async () => {
    await updateOrCreate(storePath, "base", "test", {
      sections: [{ name: "role", body: "helper" }],
      frontmatter: { name: "Base" },
    });
    const result = await resolve(storePath, "base", 5);
    expect(result.sections).toHaveLength(1);
    expect(result.resolvedFrom).toEqual(["base"]);
  });

  test("resolves single-level inheritance", async () => {
    await updateOrCreate(storePath, "parent", "test", {
      sections: [{ name: "role", body: "parent role" }],
      frontmatter: { name: "Parent" },
    });
    await updateOrCreate(storePath, "child", "test", {
      sections: [{ name: "role", body: "child role" }],
      extends: ["parent"],
      frontmatter: { name: "Child" },
    });
    const result = await resolve(storePath, "child", 5);
    expect(result.sections[0]!.body).toBe("child role");
    expect(result.resolvedFrom).toContain("parent");
    expect(result.resolvedFrom).toContain("child");
  });

  test("resolves 3-level inheritance chain with correct override order", async () => {
    await updateOrCreate(storePath, "grandparent", "test", {
      sections: [{ name: "role", body: "grandparent" }, { name: "constraints", body: "gp constraints" }],
      frontmatter: { name: "GP" },
    });
    await updateOrCreate(storePath, "parent", "test", {
      extends: ["grandparent"],
      sections: [{ name: "role", body: "parent" }],
      frontmatter: { name: "Parent" },
    });
    await updateOrCreate(storePath, "child", "test", {
      extends: ["parent"],
      sections: [{ name: "role", body: "child" }],
      frontmatter: { name: "Child" },
    });
    const result = await resolve(storePath, "child", 5);
    expect(result.sections[0]!.body).toBe("child");
    expect(result.sections.find(s => s.name === "constraints")?.body).toBe("gp constraints");
    expect(result.resolvedFrom).toEqual(["grandparent", "parent", "child"]);
  });

  test("handles diamond inheritance without cycle error and without duplicate sections", async () => {
    // Diamond: D extends [B, C], both B and C extend A
    await updateOrCreate(storePath, "A", "test", {
      sections: [{ name: "role", body: "base role" }],
      frontmatter: { name: "A" },
    });
    await updateOrCreate(storePath, "B", "test", {
      extends: ["A"],
      sections: [{ name: "constraints", body: "B constraints" }],
      frontmatter: { name: "B" },
    });
    await updateOrCreate(storePath, "C", "test", {
      extends: ["A"],
      sections: [{ name: "workflow", body: "C workflow" }],
      frontmatter: { name: "C" },
    });
    await updateOrCreate(storePath, "D", "test", {
      extends: ["B", "C"],
      sections: [{ name: "role", body: "D role" }],
      frontmatter: { name: "D" },
    });
    const result = await resolve(storePath, "D", 5);
    // Should not throw cycle error despite shared ancestor A
    expect(result.sections.find(s => s.name === "role")?.body).toBe("D role");
    expect(result.sections.find(s => s.name === "constraints")).toBeDefined();
    expect(result.sections.find(s => s.name === "workflow")).toBeDefined();
    expect(result.resolvedFrom).toContain("A");
    expect(result.resolvedFrom).toContain("B");
    expect(result.resolvedFrom).toContain("C");
    expect(result.resolvedFrom).toContain("D");
  });

  test("throws on depth exceeded", async () => {
    // Depth test: chain-9 → chain-8 → ... → chain-0 → leaf (9 ancestor edges from chain-9)
    // maxDepth=3 allows resolving 3 levels of ancestors before stopping.
    // chain-9 resolves chain-8 (depth 1), chain-7 (depth 2), chain-6 (depth 3 = maxDepth, throws).
    for (let i = 0; i < 10; i++) {
      const prev = i === 0 ? "leaf" : `chain-${i - 1}`;
      await updateOrCreate(storePath, `chain-${i}`, "test", {
        extends: [prev],
        sections: [],
        frontmatter: {},
      });
    }
    await updateOrCreate(storePath, "leaf", "test", { sections: [], frontmatter: {} });
    await expect(resolve(storePath, "chain-9", 3)).rejects.toThrow();
  });
});

describe("topologicalSort", () => {
  test("returns leaves before dependents", async () => {
    await updateOrCreate(storePath, "base", "test", { sections: [], frontmatter: {} });
    await updateOrCreate(storePath, "child", "test", { extends: ["base"], sections: [], frontmatter: {} });
    const order = await topologicalSort(storePath);
    expect(order.indexOf("base")).toBeLessThan(order.indexOf("child"));
  });

  test("throws on cycle", async () => {
    await updateOrCreate(storePath, "a", "test", { extends: ["b"], sections: [], frontmatter: {} });
    await updateOrCreate(storePath, "b", "test", { extends: ["a"], sections: [], frontmatter: {} });
    await expect(topologicalSort(storePath)).rejects.toThrow();
  });
});
