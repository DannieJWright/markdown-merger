import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { readStore, appendRecord, findLatest, updateOrCreate, replaceStoreSnapshot } from "@md-merger/store";
import type { StoreFileOps } from "@md-merger/store";
import { mkdirSync, writeFileSync, rmSync, readdirSync } from "node:fs";
import { join } from "node:path";
import type { PromptRecord } from "@md-merger/types";

const baseTempDir = join(import.meta.dirname, "..", "build", "tmp");
const testDir = join(baseTempDir, "evo-test-store-" + Math.random().toString(36).slice(2));

beforeEach(() => {
  mkdirSync(testDir, { recursive: true });
});

afterEach(() => {
  rmSync(testDir, { recursive: true, force: true });
});

const testStore = join(testDir, "test.jsonl");

function makeRecord(name: string, version = 1): PromptRecord {
  return {
    id: `test-${name}`,
    name,
    version,
    sections: [],
    frontmatter: {},
    abstract: false,
    status: "active",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

describe("readStore", () => {
  test("returns empty array for non-existent file", async () => {
    const records = await readStore(join(testDir, "does-not-exist.jsonl"));
    expect(records).toEqual([]);
  });

  test("returns records from file", async () => {
    const r = makeRecord("base");
    writeFileSync(testStore, JSON.stringify(r) + "\n");
    const records = await readStore(testStore);
    expect(records).toHaveLength(1);
    expect(records[0]!.name).toBe("base");
  });
});

describe("replaceStoreSnapshot", () => {
  test("replaces atomically and cleans temporary file", async () => {
    await replaceStoreSnapshot(testStore, [makeRecord("current")]);
    expect((await readStore(testStore)).map((record) => record.name)).toEqual(["current"]);
    expect(readdirSync(testDir).some((name) => name.endsWith(".tmp"))).toBe(false);
  });
  test("preserves original on write failure", async () => {
    writeFileSync(testStore, JSON.stringify(makeRecord("original")) + "\n");
    const ops: StoreFileOps = { mkdir: async (...a) => mkdirSync(a[0] as string, { recursive: true }), writeFile: async () => { throw new Error("write boom"); }, rename: async () => {}, rm: async () => {} } as StoreFileOps;
    await expect(replaceStoreSnapshot(testStore, [makeRecord("new")], ops)).rejects.toThrow("write boom");
    expect((await readStore(testStore)).map((record) => record.name)).toEqual(["original"]);
    expect(readdirSync(testDir).some((name) => name.endsWith(".tmp"))).toBe(false);
  });
  test("preserves original on rename failure and cleans temporary file", async () => {
    writeFileSync(testStore, JSON.stringify(makeRecord("original")) + "\n");
    const ops: StoreFileOps = { mkdir: async (...a) => mkdirSync(a[0] as string, { recursive: true }), writeFile: async (path, data) => writeFileSync(path as string, data as string), rename: async () => { throw new Error("rename boom"); }, rm: async (path) => rmSync(path as string, { force: true }) } as StoreFileOps;
    await expect(replaceStoreSnapshot(testStore, [makeRecord("new")], ops)).rejects.toThrow("rename boom");
    expect((await readStore(testStore)).map((record) => record.name)).toEqual(["original"]);
    expect(readdirSync(testDir).some((name) => name.endsWith(".tmp"))).toBe(false);
  });
  test("cleans a partially written temp file after write failure", async () => {
    writeFileSync(testStore, JSON.stringify(makeRecord("original")) + "\n");
    const ops: StoreFileOps = { mkdir: async (...a) => mkdirSync(a[0] as string, { recursive: true }), writeFile: async (path, data) => { writeFileSync(path as string, (data as string).slice(0, 5)); throw new Error("partial write boom"); }, rename: async () => {}, rm: async (path) => rmSync(path as string, { force: true }) } as StoreFileOps;
    await expect(replaceStoreSnapshot(testStore, [makeRecord("new")], ops)).rejects.toThrow("partial write boom");
    expect(readdirSync(testDir).some((name) => name.endsWith(".tmp"))).toBe(false);
  });
});

describe("findLatest", () => {
  test("returns highest version for a name", async () => {
    await appendRecord(testStore, makeRecord("base", 1));
    await appendRecord(testStore, makeRecord("base", 3));
    await appendRecord(testStore, makeRecord("base", 2));
    const latest = await findLatest(testStore, "base");
    expect(latest).toBeDefined();
    expect(latest!.version).toBe(3);
  });

  test("returns undefined for unknown name", async () => {
    const result = await findLatest(testStore, "nonexistent");
    expect(result).toBeUndefined();
  });
});

describe("updateOrCreate", () => {
  test("creates new record when name does not exist", async () => {
    const record = await updateOrCreate(testStore, "new-agent", "test", {});
    expect(record.name).toBe("new-agent");
    expect(record.version).toBe(1);
  });

  test("increments version on update", async () => {
    await updateOrCreate(testStore, "agent1", "test", {});
    const v2 = await updateOrCreate(testStore, "agent1", "test", { sections: [] });
    expect(v2.version).toBe(2);
  });
});
