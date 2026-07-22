import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { build } from "./import";
import { readStore, findLatest } from "./store";

const testDir = join(tmpdir(), "evo-test-import-" + Math.random().toString(36).slice(2));
const rootDir = join(testDir, "agents");
const storePath = join(testDir, "store.jsonl");

beforeEach(() => {
  mkdirSync(rootDir, { recursive: true });
});
afterEach(() => {
  rmSync(testDir, { recursive: true, force: true });
});

describe("build", () => {
  test("imports a single agent file", async () => {
    writeFileSync(join(rootDir, "base.md"), "---\nname: base\n---\n## Role\nYou are helpful.");
    await build([rootDir], storePath, "test-project");
    const record = await findLatest(storePath, "base");
    expect(record).toBeDefined();
    expect(record!.sections).toHaveLength(1);
    expect(record!.sections[0]!.name).toBe("role");
  });

  test("imports nested path as module name", async () => {
    mkdirSync(join(rootDir, "system"), { recursive: true });
    writeFileSync(join(rootDir, "system", "base.md"), "## Role\nYou are a system agent.");
    await build([rootDir], storePath, "test-project");
    const record = await findLatest(storePath, "system/base");
    expect(record).toBeDefined();
  });

  test("handles abstract: true", async () => {
    writeFileSync(join(rootDir, "base.md"), "---\nabstract: true\n---\n## Role\nBase.");
    await build([rootDir], storePath, "test-project");
    const record = await findLatest(storePath, "base");
    expect(record!.abstract).toBe(true);
  });

  test("handles extends array in frontmatter", async () => {
    writeFileSync(join(rootDir, "child.md"), "---\nextends: [base]\n---\n## Role\nChild.");
    await build([rootDir], storePath, "test-project");
    const record = await findLatest(storePath, "child");
    expect(record!.extends).toEqual(["base"]);
  });

  test("build is idempotent — repeated builds don't append duplicates", async () => {
    writeFileSync(join(rootDir, "base.md"), "---\nname: base\n---\n## Role\nYou are helpful.");

    await build([rootDir], storePath, "test-project");
    let records = await readStore(storePath);
    expect(records).toHaveLength(1);

    await build([rootDir], storePath, "test-project");
    records = await readStore(storePath);
    expect(records).toHaveLength(1); // should still be 1, not 2
  });

  test("first root dir wins when same module name exists in multiple roots", async () => {
    const rootA = join(rootDir, "a");
    const rootB = join(rootDir, "b");
    mkdirSync(rootA, { recursive: true });
    mkdirSync(rootB, { recursive: true });

    writeFileSync(join(rootA, "base.md"), "---\nname: BaseA\n---\n## Role\nRole from A.");
    writeFileSync(join(rootB, "base.md"), "---\nname: BaseB\n---\n## Role\nRole from B.");

    await build([rootA, rootB], storePath, "test-project");

    const record = await findLatest(storePath, "base");
    expect(record).toBeDefined();
    expect(record!.frontmatter).toHaveProperty("name", "BaseA");
  });
});
