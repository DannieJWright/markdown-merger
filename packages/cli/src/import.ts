import { access, constants as fsConstants, readdir, readFile, stat, truncate } from "node:fs/promises";
import { join, relative, sep } from "node:path";
import { extractFrontmatter, parseSections } from "./frontmatter";
import { findLatest, updateOrCreate } from "./store";
import type { PromptRecord } from "./types";

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

/**
 * Glob `.md` files from each rootDir, parse them, and write records to the JSONL store.
 *
 * Multiple root dirs act as independent namespaces; first match wins.
 * If a module name computed from rootDir-B already exists in the store from rootDir-A,
 * skip importing from rootDir-B.
 */
export async function build(
  rootDirs: string[],
  storePath: string,
  project: string,
): Promise<void> {
  const seen = new Set<string>();

  for (const rootDir of rootDirs) {
    const files = await globMd(rootDir);

    for (const filepath of files) {
      const modulePath = relative(rootDir, filepath)
        .replace(/\.md$/, "")
        .replace(/\\/g, "/");

      // First match wins — skip if already seen in this build
      if (seen.has(modulePath)) continue;
      seen.add(modulePath);

      const content = await readFile(filepath, "utf-8");
      const { metadata, body } = extractFrontmatter(content);
      const sections = parseSections(body);

      const extendsArr = Array.isArray(metadata.extends)
        ? (metadata.extends as string[])
        : undefined;
      const abstractBool = metadata.abstract === true;

      // Guard against empty strings to prevent confusing warnings during emit
      const typeValue = typeof metadata.type === "string" && metadata.type.length > 0
        ? (metadata.type as string).trim()
        : undefined;

      const existing = await findLatest(storePath, modulePath);

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

      if (existing) {
        await updateOrCreate(storePath, modulePath, project, patch);
      } else {
        await updateOrCreate(storePath, modulePath, project, {
          ...patch,
          status: "active",
        });
      }
    }
  }
}
