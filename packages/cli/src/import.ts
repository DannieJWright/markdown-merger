import { access, constants as fsConstants, readdir, readFile, stat, truncate } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { extractFrontmatter, parseSections } from "./frontmatter";
import { loadRootExports } from "./root-exports";
import { readStore, replaceStoreSnapshot, StoreSnapshotError } from "./store";
import type { PromptRecord, RootDir } from "./types";

type BuildRootDir = string | RootDir;

function normalizeRootDir(rootDir: BuildRootDir): RootDir {
  return typeof rootDir === "string" ? { path: rootDir, optional: false } : rootDir;
}

/**
 * Recursively glob all `.md` files under a root directory.
 */
async function globMd(dir: string): Promise<string[]> {
  const results: string[] = [];
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...(await globMd(fullPath)));
    } else if (entry.isFile() && entry.name.endsWith(".md")) {
      results.push(fullPath);
    }
  }
  return results;
}

export function normalizeModuleReference(reference: string): string {
  return reference.trim().replace(/\\/g, "/").replace(/\.md$/, "");
}

export function resolveModuleReference(reference: string, exports: ReadonlyMap<string, string>): string {
  const normalized = normalizeModuleReference(reference);
  if (normalized.includes("/")) return normalized;
  return exports.get(normalized) ?? normalized;
}

interface RootScan { rootDir: string; files: string[]; moduleNames: Set<string>; }

export interface BuildResult {
  exports: Map<string, string>;
  exportedModules: Set<string>;
}

function moduleName(rootDir: string, filepath: string): string {
  return relative(rootDir, filepath).replace(/\\/g, "/").replace(/\.md$/, "");
}

/**
 * Glob `.md` files from each rootDir, parse them, and write records to the JSONL store.
 *
 * Root dirs are processed in order and later roots win.
 */
export async function build(
  rootDirs: ReadonlyArray<BuildRootDir>,
  storePath: string,
  project: string,
): Promise<BuildResult> {
  try {
    const scans: RootScan[] = [];
    for (const root of rootDirs.map(normalizeRootDir)) {
      if (!existsSync(root.path) && root.optional) {
        console.error(`[md-merger] Skipping missing optional root directory: ${root.path}`);
        continue;
      }
      const files = await globMd(root.path);
      scans.push({ rootDir: root.path, files, moduleNames: new Set(files.map((file) => moduleName(root.path, file))) });
    }
  const exports = new Map<string, string>();
  const exportedModules = new Set<string>();
  for (const scan of scans) {
    const rootExports = await loadRootExports(scan.rootDir, scan.moduleNames);
    for (const [alias, target] of rootExports) { exportedModules.add(target); exports.set(alias, target); }
  }

  const previous = new Map<string, PromptRecord>();
  for (const record of await readStore(storePath)) {
    const prior = previous.get(record.name);
    if (!prior || record.version > prior.version) previous.set(record.name, record);
  }
  const snapshot = new Map<string, PromptRecord>();
  for (const { rootDir, files } of scans) {

    for (const filepath of files) {
      const modulePath = moduleName(rootDir, filepath);

      const content = await readFile(filepath, "utf-8");
      const { metadata, body } = extractFrontmatter(content);
      const sections = parseSections(body);

      const extendsArr = Array.isArray(metadata.extends)
        ? (metadata.extends as string[]).map((entry) => resolveModuleReference(entry, exports))
        : undefined;
      const abstractBool = metadata.abstract === true;

      // Guard against empty strings to prevent confusing warnings during emit
      const typeValue = typeof metadata.type === "string" && metadata.type.length > 0
        ? (metadata.type as string).trim()
        : undefined;

      const existing = previous.get(modulePath);

      // Build the patch object — for updates, only include type if it has a value
      // to avoid erasing the existing record's type on re-import
      const patch: Partial<PromptRecord> = {
        sections,
        frontmatter: metadata,
        extends: extendsArr,
        abstract: abstractBool,
      };

      if (typeValue !== undefined) {
        patch.type = typeValue;
      }

      const now = new Date().toISOString();
      const record: PromptRecord = existing
        ? { ...existing, ...patch, name: modulePath, version: existing.version + 1, updatedAt: now }
        : { id: `${project}-${crypto.randomUUID().slice(0, 4)}`, name: modulePath, version: 1, sections, frontmatter: metadata, extends: extendsArr, abstract: abstractBool, ...(typeValue === undefined ? {} : { type: typeValue }), status: "active", createdAt: now, updatedAt: now };
      snapshot.set(modulePath, record);
    }
  }

  try {
    await replaceStoreSnapshot(storePath, [...snapshot.values()]);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (error instanceof StoreSnapshotError && error.phase === "prepare") {
      throw new Error(`Build failed; existing store was not updated: ${message}`, { cause: error.cause });
    }
    throw new Error(`Build snapshot was prepared, but store replacement failed; existing store was not updated: ${message}`, { cause: error instanceof StoreSnapshotError ? error.cause : error });
  }

  return { exports, exportedModules };
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("Build snapshot was prepared")) throw error;
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Build failed; existing store was not updated: ${message}`, { cause: error });
  }
}
