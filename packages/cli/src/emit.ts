// Adapted from Canopy (https://github.com/jayminwest/canopy), src/render.ts
// Original Copyright (c) 2026 Canopy contributors, MIT License

import { resolve, topologicalSort } from "./resolve";
import { readStore } from "./store";
import { sectionNameToPascalCase } from "./frontmatter";
import type { Config, PromptRecord, Section } from "./types";

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
 *    - Write to ${targetDir}/${name}.md (replace / with _ in name)
 * 4. If dryRun: print "Would write: {path}" instead of writing
 * 5. Return array of written file paths
 * 6. Error handling: if renderText fails for one module, log to stderr
 *    but continue processing remaining modules
 */
export async function emitAll(
  storePath: string,
  emitDirs: Record<string, string>,
  config: Config,
  dryRun: boolean = false,
): Promise<string[]> {
  // Step 1: Read all records and deduplicate
  const records = await readStore(storePath);
  const dedupedRecords = deduplicateRecords(records);

  if (dedupedRecords.length === 0) {
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
  const writtenPaths: string[] = [];
  const failedModules: string[] = [];

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
      continue;
    }

    // Build output filename: replace / with _
    const safeName = name.replace(/\//g, "_");
    const filePath = `${targetDir}/${safeName}.md`;

    // Step 4/5: dryRun or write
    if (dryRun) {
      console.log(`Would write: ${filePath}`);
      writtenPaths.push(filePath);
    } else {
      // Create parent directories if needed
      const { mkdirSync } = await import("node:fs");
      const { dirname } = await import("node:path");
      mkdirSync(dirname(filePath), { recursive: true });

      const { writeFileSync } = await import("node:fs");
      writeFileSync(filePath, text, "utf-8");
      writtenPaths.push(filePath);
    }
  }

  // Report failures
  if (failedModules.length > 0) {
    console.error(
      `\nFailed to render ${failedModules.length} module(s): ${failedModules.join(", ")}`,
    );
  }

  return writtenPaths;
}
