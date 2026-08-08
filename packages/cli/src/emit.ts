// Adapted from Canopy (https://github.com/jayminwest/canopy), src/render.ts
// Original Copyright (c) 2026 Canopy contributors, MIT License

import { resolve, topologicalSort } from "./resolve";
import { readStore } from "./store";
import { sectionNameToPascalCase } from "./frontmatter";
import type { Config, PromptRecord, Section } from "./types";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync, renameSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve as resolvePath } from "node:path";

const MANAGED_OUTPUT_VERSION = 1;
interface ManagedOutputManifest { version: 1; roots: string[]; files: string[]; }
export interface EmitFileOps { writeFileSync: typeof writeFileSync; renameSync: typeof renameSync; }

function managedOutputManifestPath(storePath: string): string { return `${storePath}.outputs.json`; }
function isWithin(root: string, candidate: string): boolean {
  const rel = relative(root, candidate);
  return rel !== "" && !rel.startsWith("..") && !isAbsolute(rel);
}
function readManagedManifest(storePath: string): { manifest: ManagedOutputManifest | null; trusted: Set<string> } {
  const path = managedOutputManifestPath(storePath);
  if (!existsSync(path)) return { manifest: null, trusted: new Set() };
  try {
    const value: unknown = JSON.parse(readFileSync(path, "utf8"));
    if (!value || typeof value !== "object") return { manifest: null, trusted: new Set() };
    const candidate = value as Partial<ManagedOutputManifest>;
    if (candidate.version !== MANAGED_OUTPUT_VERSION || !Array.isArray(candidate.roots) || !Array.isArray(candidate.files)
      || !candidate.roots.every((v) => typeof v === "string") || !candidate.files.every((v) => typeof v === "string")) {
      return { manifest: null, trusted: new Set() };
    }
    const roots = candidate.roots.map((v) => resolvePath(v));
    const trusted = new Set(candidate.files.map((v) => resolvePath(v)).filter((file) => roots.some((root) => isWithin(root, file))));
    return { manifest: { version: 1, roots, files: [...trusted] }, trusted };
  } catch { return { manifest: null, trusted: new Set() }; }
}

function writeManagedManifest(storePath: string, manifest: ManagedOutputManifest, ops: EmitFileOps = { writeFileSync, renameSync }): void {
  const path = managedOutputManifestPath(storePath);
  const tmp = `${path}.${process.pid}.${Math.random().toString(36).slice(2)}.tmp`;
  try {
    mkdirSync(dirname(path), { recursive: true });
    ops.writeFileSync(tmp, JSON.stringify(manifest, null, 2) + "\n", "utf8");
    ops.renameSync(tmp, path);
  } finally { if (existsSync(tmp)) rmSync(tmp, { force: true }); }
}

function renderSection(section: Section): string {
  const level = section.level ?? 1;
  const hashes = "#".repeat(level + 1);
  const displayName = sectionNameToPascalCase(section.name);

  let result = `${hashes} ${displayName}`;
  if (section.body) result += "\n\n" + section.body;
  if (section.children?.length) {
    for (const child of section.children) result += "\n\n" + renderSection(child);
  }
  return result;
}

/**
 * Render a resolved module as a markdown string.
 *
 * 1. Resolve the module (with inheritance) via resolve
 * 2. Build frontmatter: copy resolved frontmatter, delete `extends`, `abstract`, and `type`
 * 3. If frontmatter has keys: render `---\n{yaml lines}\n---\n\n`
 * 4. For each section (depth-first, respecting level): render with correct heading depth
 * 5. Return full string
 */
export async function renderText(
  storePath: string,
  name: string,
  maxDepth: number,
): Promise<string> {
  const result = await resolve(storePath, name, maxDepth);
  const fm = { ...result.frontmatter };
  delete fm.extends;
  delete fm.abstract;
  delete fm.type;

  let output = "";
  const fmKeys = Object.keys(fm);
  if (fmKeys.length > 0) {
    output += "---\n";
    for (const key of fmKeys) {
      const value = fm[key];
      if (typeof value === "string") output += `${key}: ${value}\n`;
      else if (typeof value === "boolean") output += `${key}: ${value}\n`;
      else if (Array.isArray(value)) output += `${key}: [${value.map((v) => (typeof v === "string" ? `'${v}'` : String(v))).join(", ")}]\n`;
      else output += `${key}: ${JSON.stringify(value)}\n`;
    }
    output += "---\n\n";
  }

  const sectionTexts = result.sections.map(renderSection);
  if (sectionTexts.length > 0) {
    output += sectionTexts.join("\n\n") + "\n";
  }
  return output;
}

/**
 * Deduplicate store records to keep only the latest version per name.
 */
export function deduplicateRecords(records: PromptRecord[]): PromptRecord[] {
  const latestByNames = new Map<string, PromptRecord>();
  for (const record of records) {
    const existing = latestByNames.get(record.name);
    if (!existing || record.version > existing.version) {
      latestByNames.set(record.name, record);
    }
  }
  return Array.from(latestByNames.values());
}

/**
 * Emit all resolved modules as markdown files.
 *
 * 1. Read all records, deduplicate to latest version per name
 * 2. Topological sort to get processing order
 * 3. For each module in topological order (skipping abstract):
 *    - Resolve via resolve
 *    - Route to correct dir based on module type
 *    - Write to ${targetDir}/${name}.md, preserving nested module path segments
 * 4. If dryRun: print "Would write: {path}" instead of writing
 * 5. Return array of written file paths
 * 6. Error handling: if renderText fails for one module, log to stderr
 *    but continue processing remaining modules
 */
export interface EmittedFile { path: string; type: string; }

export async function emitAllWithMetadata(
  storePath: string,
  emitDirs: Record<string, string>,
  config: Config,
  dryRun: boolean = false,
  fileOps?: EmitFileOps,
): Promise<EmittedFile[]> {
  // Step 1: Read all records and deduplicate
  const records = await readStore(storePath);
  const dedupedRecords = deduplicateRecords(records);

  if (dedupedRecords.length === 0) {
    if (!dryRun) reconcileManagedOutputs(storePath, emitDirs, new Set(), new Set(), fileOps);
    return [];
  }

  // Step 2: Topological sort
  let sortedNames: string[];
  try {
    sortedNames = await topologicalSort(storePath);
  } catch (err) {
    console.error(`Emit aborted: ${err instanceof Error ? err.message : String(err)}`);
    return [];
  }

  // Build a map of name → record for quick lookup
  const recordMap = new Map<string, PromptRecord>();
  for (const record of dedupedRecords) {
    recordMap.set(record.name, record);
  }

  // Step 3: Process in topological order, skipping abstract modules
  const writtenPaths: EmittedFile[] = [];
  const failedModules: string[] = [];
  const failedPaths = new Set<string>();

  for (const name of sortedNames) {
    const record = recordMap.get(name);
    if (!record) continue;

    // Skip abstract modules
    if (record.abstract) {
      continue;
    }

    // Route by type
    if (!record.type) {
      continue;
    }
    const targetDir = emitDirs[record.type];
    if (!targetDir) {
      console.error(`No emit dir configured for type "${record.type}" in module "${name}", skipping`);
      continue;
    }

    // Render the module text
    let text: string;
    try {
      text = await renderText(storePath, name, config.maxInheritDepth);
    } catch (err) {
      console.error(`Failed to render "${name}": ${err instanceof Error ? err.message : String(err)}`);
      failedModules.push(name);
      failedPaths.add(resolvePath(join(targetDir, `${name}.md`)));
      continue;
    }

    const { join: joinPath } = await import("node:path");
    const filePath = resolvePath(joinPath(targetDir, `${name}.md`));

    // Step 4/5: dryRun or write
    if (dryRun) {
      console.log(`Would write: ${filePath}`);
      writtenPaths.push({ path: filePath, type: record.type });
    } else {
      try {
        mkdirSync(dirname(filePath), { recursive: true });
        writeFileSync(filePath, text, "utf-8");
        writtenPaths.push({ path: filePath, type: record.type });
      } catch (err) {
        failedModules.push(name);
        failedPaths.add(filePath);
        console.error(`Failed to write "${name}": ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  }

  // Report failures
  if (failedModules.length > 0) {
    console.error(
      `\nFailed to render ${failedModules.length} module(s): ${failedModules.join(", ")}`,
    );
  }

  if (!dryRun) {
    reconcileManagedOutputs(storePath, emitDirs, new Set(writtenPaths.map((file) => resolvePath(file.path))), failedPaths, fileOps);
  }

  return writtenPaths;
}

function reconcileManagedOutputs(storePath: string, emitDirs: Record<string, string>, successful: Set<string>, failed: Set<string>, fileOps?: EmitFileOps): void {
  const previous = readManagedManifest(storePath);
  const retained = [...previous.trusted].filter((path) => failed.has(path));
  const nextFiles = new Set([...successful, ...retained]);
  for (const oldPath of previous.trusted) {
    if (!nextFiles.has(oldPath)) {
      try { rmSync(oldPath, { force: true }); }
      catch (cause) { throw new Error(`Failed to remove stale managed output "${oldPath}": ${cause instanceof Error ? cause.message : String(cause)}`, { cause }); }
    }
  }
  try {
    writeManagedManifest(storePath, { version: 1, roots: [...new Set(Object.values(emitDirs).map((root) => resolvePath(root)))], files: [...nextFiles] }, fileOps);
  } catch (cause) {
    const path = managedOutputManifestPath(storePath);
    throw new Error(`Failed to write managed output manifest "${path}": ${cause instanceof Error ? cause.message : String(cause)}`, { cause });
  }
}

export async function emitAll(storePath: string, emitDirs: Record<string, string>, config: Config, dryRun = false): Promise<string[]> {
  return (await emitAllWithMetadata(storePath, emitDirs, config, dryRun)).map((file) => file.path);
}
