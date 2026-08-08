import { afterEach, describe, expect, test } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { loadRootExports, ROOT_CONFIG_FILENAME } from "@md-merger/root-exports";

const roots: string[] = [];
function makeRoot(): string {
  const root = join(import.meta.dirname, "..", "build", "tmp", `root-exports-${Math.random().toString(36).slice(2)}`);
  mkdirSync(root, { recursive: true });
  roots.push(root);
  return root;
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("loadRootExports", () => {
  test("returns no exports when the optional manifest is absent", async () => {
    const rootDir = makeRoot();
    expect(await loadRootExports(rootDir, new Set(["base/agent"]))).toEqual(new Map());
  });

  test("loads aliases and normalizes md suffixes and separators", async () => {
    const rootDir = makeRoot();
    writeFileSync(join(rootDir, ROOT_CONFIG_FILENAME), [
      "exports:",
      "  orchestrator: base/orchestrator.md",
      "  worker: base\\worker.md",
      "",
    ].join("\n"));
    expect(await loadRootExports(rootDir, new Set(["base/orchestrator", "base/worker"]))).toEqual(new Map([
      ["orchestrator", "base/orchestrator"],
      ["worker", "base/worker"],
    ]));
  });

  const invalidManifests = [
    ["missing exports mapping", "name: root\n", "exports"], ["exports is scalar", "exports: base/agent\n", "mapping"],
    ["duplicate top-level exports", "exports:\nexports:\n", "Duplicate"], ["unknown top-level key", "exports:\nname: root\n", "content"],
    ["inline top-level exports map", "exports: { base: base/agent }\n", "mapping"], ["quoted scalar", "exports:\n  base: 'base/agent'\n", "Invalid"],
    ["inline comment", "exports:\n  base: base/agent # comment\n", "Invalid"], ["inline entry map", "exports:\n  base: { path: base/agent }\n", "Invalid"],
    ["nested value", "exports:\n  base:\n    path: base/agent\n", "entry"], ["empty alias", "exports:\n  : base/agent\n", "Expected a mapping entry"],
    ["slash in alias", "exports:\n  base/agent: base/agent\n", "alias"], ["backslash in alias", "exports:\n  base\\agent: base/agent\n", "alias"],
    ["duplicate alias", "exports:\n  base: base/one\n  base: base/two\n", "Duplicate"], ["empty target", "exports:\n  base:\n", "entry"],
    ["absolute target", "exports:\n  base: /base/agent.md\n", "relative"], ["Windows drive target", "exports:\n  base: C:\\base\\agent.md\n", "relative"],
    ["Windows UNC target", "exports:\n  base: \\\\server\\share\\agent.md\n", "relative"], ["dot segment", "exports:\n  base: ./base/agent.md\n", "segment"],
    ["parent traversal", "exports:\n  base: ../base/agent.md\n", "segment"], ["quoted alias", "exports:\n  'base': base/agent\n", "Invalid"],
    ["indented exports", "  exports:\n    base: base/agent\n", "exports"], ["unindented entry", "exports:\nbase: base/agent\n", "indent"],
    ["incorrect entry indentation", "exports:\n   base: base/agent\n", "indent"], ["non-mapping content", "exports:\n  - base/agent\n", "mapping"],
    ["tab after required indentation", "exports:\n  \talias: base/agent.md\n", "indent"],
    ["vertical tab after required indentation", "exports:\n  \valias: base/agent.md\n", "indent"],
  ] as const;
  test.each(invalidManifests)("rejects %s", async (_name, manifest, message) => {
    const rootDir = makeRoot(); writeFileSync(join(rootDir, ROOT_CONFIG_FILENAME), manifest);
    await expect(loadRootExports(rootDir, new Set(["base/agent", "base/one", "base/two"]))).rejects.toThrow(message);
  });

  test("accepts empty, CRLF, and comments", async () => {
    const rootDir = makeRoot(); writeFileSync(join(rootDir, ROOT_CONFIG_FILENAME), "# hi\r\nexports:\r\n# bye\r\n");
    expect(await loadRootExports(rootDir, new Set())).toEqual(new Map());
  });

  test("rejects an export whose target is not a module in the same root", async () => {
    const rootDir = makeRoot(); writeFileSync(join(rootDir, ROOT_CONFIG_FILENAME), "exports:\n  base: elsewhere/base.md\n");
    await expect(loadRootExports(rootDir, new Set(["base/agent"]))).rejects.toThrow("elsewhere/base");
  });

  test("rejects inline comments preceded by a tab regardless of module names", async () => {
    const rootDir = makeRoot();
    writeFileSync(join(rootDir, ROOT_CONFIG_FILENAME), "exports:\n  base: base/agent\t# comment\n");
    await expect(loadRootExports(rootDir, new Set(["base/agent"]))).rejects.toThrow("Invalid");
    await expect(loadRootExports(rootDir, new Set())).rejects.toThrow("Invalid");
  });

  test("rejects alias-side inline comments", async () => {
    const rootDir = makeRoot();
    writeFileSync(join(rootDir, ROOT_CONFIG_FILENAME), "exports:\n  alias # comment: base/agent\n");
    await expect(loadRootExports(rootDir, new Set(["base/agent"]))).rejects.toThrow("Invalid");
  });
});
