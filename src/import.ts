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
  // Clear the store so repeated builds are idempotent
  try {
    await access(storePath, fsConstants.F_OK);
    await truncate(storePath, 0);
  } catch {
    // File doesn't exist yet — nothing to clear
  }

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

      const existing = await findLatest(storePath, modulePath);

      if (existing) {
        await updateOrCreate(storePath, modulePath, project, {
          sections,
          frontmatter: metadata,
          extends: extendsArr,
          abstract: abstractBool,
        });
      } else {
        await updateOrCreate(storePath, modulePath, project, {
          sections,
          frontmatter: metadata,
          extends: extendsArr,
          abstract: abstractBool,
          status: "active",
        });
      }
    }
  }
}
