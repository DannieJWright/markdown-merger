import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { readStore, appendRecord, findLatest, updateOrCreate } from "@md-merger/store";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
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
