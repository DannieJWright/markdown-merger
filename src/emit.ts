// Adapted from Canopy (https://github.com/jayminwest/canopy), src/render.ts
// Original Copyright (c) 2026 Canopy contributors, MIT License

import { resolvePrompt, topologicalSort } from "./resolve";
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
  return result + "\n\n";
}

/**
 * Render a resolved agent as a markdown string.
 *
 * 1. Resolve the prompt (with inheritance) via resolvePrompt
 * 2. Build frontmatter: copy resolved frontmatter, delete `extends` and `abstract`
 * 3. If frontmatter has keys: render `---\n{yaml lines}\n---\n\n`
 * 4. For each section (depth-first, respecting level): render with correct heading depth
 * 5. Return full string
 */
export async function renderPromptText(
  storePath: string,
  name: string,
  maxDepth: number,
): Promise<string> {
  const result = await resolvePrompt(storePath, name, maxDepth);
  const fm = { ...result.frontmatter };
  delete fm.extends;
  delete fm.abstract;

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

  for (const section of result.sections) output += renderSection(section);
  return output;
}

/**
 * Deduplicate store records to keep only the latest version per name.
 */
function deduplicateRecords(records: PromptRecord[]): PromptRecord[] {
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
 * Emit all resolved agents as markdown files.
 *
 * 1. Read all records, deduplicate to latest version per name
 * 2. Topological sort to get processing order
 * 3. For each agent in topological order (skipping abstract):
 *    - Call renderPromptText
 *    - Write to ${emitDir}/${name}.md (replace / with _ in name)
 * 4. If dryRun: print "Would write: {path}" instead of writing
 * 5. Return array of written file paths
 * 6. Error handling: if renderPromptText fails for one agent, log to stderr
 *    but continue processing remaining agents
 */
export async function emitAll(
  storePath: string,
  emitDir: string,
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

  // Step 3: Process in topological order, skipping abstract agents
  const writtenPaths: string[] = [];
  const failedAgents: string[] = [];

  for (const name of sortedNames) {
    const record = recordMap.get(name);
    if (!record) continue;

    // Skip abstract agents
    if (record.abstract) {
      continue;
    }

    // Render the prompt text
    let text: string;
    try {
      text = await renderPromptText(storePath, name, config.maxInheritDepth);
    } catch (err) {
      console.error(`Failed to render "${name}": ${err instanceof Error ? err.message : String(err)}`);
      failedAgents.push(name);
      continue;
    }

    // Build output filename: replace / with _
    const safeName = name.replace(/\//g, "_");
    const filePath = `${emitDir}/${safeName}.md`;

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
  if (failedAgents.length > 0) {
    console.error(
      `\nEmit completed with ${failedAgents.length} failure(s): ${failedAgents.join(", ")}`,
    );
  }

  return writtenPaths;
}
