import { appendFile } from "node:fs/promises";
import type { PromptRecord } from "./types";

/**
 * Read all valid JSON lines from a JSONL store file.
 * Returns empty array if the file does not exist.
 * Skips blank lines and lines that fail JSON.parse.
 */
export async function readStore(storePath: string): Promise<PromptRecord[]> {
  const file = Bun.file(storePath);
  if (!(await file.exists())) {
    return [];
  }
  const text = await file.text();
  const lines = text.split("\n");
  const records: PromptRecord[] = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed === "") continue;
    try {
      const record = JSON.parse(trimmed) as PromptRecord;
      records.push(record);
    } catch {
      // Skip malformed JSONL lines
    }
  }
  return records;
}

/**
 * Append a single record as a JSON line to the store file.
 * Ensures the file ends with a newline before appending.
 */
export async function appendRecord(storePath: string, record: PromptRecord): Promise<void> {
  const line = JSON.stringify(record) + "\n";
  await appendFile(storePath, line);
}

/**
 * Find the latest (highest version) record matching the given name.
 * Returns undefined if no matching record exists.
 */
export async function findLatest(storePath: string, name: string): Promise<PromptRecord | undefined> {
  const records = await readStore(storePath);
  const matching = records.filter((r) => r.name === name);
  if (matching.length === 0) return undefined;
  return matching.reduce((latest, current) =>
    current.version > latest.version ? current : latest
  );
}

/**
 * Update an existing record or create a new one.
 *
 * If a record exists for the given name:
 *   - Creates a new version with incremented version number
 *   - Merges fields from the updater result (non-undefined fields fully replace existing)
 *   - Appends the new version to the store
 *
 * If no record exists:
 *   - Creates version 1 with default fields merged with updater result
 *   - Appends the new record to the store
 *
 * The updater function returns Partial<PromptRecord> where each non-undefined field
 * fully replaces the existing field (no deep merge).
 */
export async function updateOrCreate(
  storePath: string,
  name: string,
  project: string,
  updater: ((existing: PromptRecord) => Partial<PromptRecord>) | Partial<PromptRecord>,
): Promise<PromptRecord> {
  const now = new Date().toISOString();
  const existingLatest = await findLatest(storePath, name);

  if (existingLatest) {
    // Update: increment version, merge fields
    const patch = typeof updater === "function" ? updater(existingLatest) : updater;
    const newRecord: PromptRecord = {
      ...existingLatest,
      ...patch,
      version: existingLatest.version + 1,
      updatedAt: now,
    };
    await appendRecord(storePath, newRecord);
    return newRecord;
  }

  // Create: new record with version 1
  const id = `${project}-${crypto.randomUUID().slice(0, 4)}`;
  const defaults: PromptRecord = {
    id,
    name,
    version: 1,
    sections: [],
    frontmatter: {},
    abstract: false,
    status: "active",
    createdAt: now,
    updatedAt: now,
  };
  const patch = typeof updater === "function" ? updater(defaults) : updater;
  const newRecord: PromptRecord = {
    ...defaults,
    ...patch,
  };
  await appendRecord(storePath, newRecord);
  return newRecord;
}
