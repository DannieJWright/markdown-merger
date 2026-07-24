import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { build } from "@md-merger/import";
import { readStore, findLatest } from "@md-merger/store";

const baseTempDir = join(import.meta.dirname, "..", "build", "tmp");
const testDir = join(baseTempDir, "evo-test-import-" + Math.random().toString(36).slice(2));
const rootDir = join(testDir, "agents");
const storePath = join(testDir, "store.jsonl");

beforeEach(() => {
  mkdirSync(rootDir, { recursive: true });
});
afterEach(() => {
  rmSync(testDir, { recursive: true, force: true });
});

describe("build", () => {
  test("imports a single module file", async () => {
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

  test("build is idempotent — repeated builds update existing records", async () => {
    writeFileSync(join(rootDir, "base.md"), "---\nname: base\n---\n## Role\nYou are helpful.");

    await build([rootDir], storePath, "test-project");
    let record = await findLatest(storePath, "base");
    expect(record).toBeDefined();
    expect(record!.sections[0]!.body).toBe("You are helpful.");

    await build([rootDir], storePath, "test-project");
    record = await findLatest(storePath, "base");
    expect(record).toBeDefined();
    expect(record!.sections[0]!.body).toBe("You are helpful.");
  });

  test("extracts type from frontmatter", async () => {
    writeFileSync(join(rootDir, "typed.md"), "---\ntype: skill\n---\n## Role\nHelper.");
    await build([rootDir], storePath, "test-project");
    const record = await findLatest(storePath, "typed");
    expect(record).toBeDefined();
    expect(record!.type).toBe("skill");
  });

  test("leaves type undefined when not in frontmatter", async () => {
    writeFileSync(join(rootDir, "notype.md"), "---\nname: NoType\n---\n## Role\nHelper.");
    await build([rootDir], storePath, "test-project");
    const record = await findLatest(storePath, "notype");
    expect(record).toBeDefined();
    expect(record!.type).toBeUndefined();
  });

 test("preserves type across rebuild when frontmatter omits type", async () => {
    writeFileSync(join(rootDir, "persist-integration.md"), "---\ntype: skill\nname: PersistIntegration\n---\n## Role\nInitial.");
    await build([rootDir], storePath, "test-project");
    let record = await findLatest(storePath, "persist-integration");
    expect(record?.type).toBe("skill");

    writeFileSync(join(rootDir, "persist-integration.md"), "---\nname: PersistIntegration\n---\n## Role\nUpdated body.");
    await build([rootDir], storePath, "test-project");
    record = await findLatest(storePath, "persist-integration");
    expect(record?.type).toBe("skill");
    expect(record?.sections[0]?.body).toBe("Updated body.");
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
