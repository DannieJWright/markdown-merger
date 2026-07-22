// Adapted from Canopy (https://github.com/jayminwest/canopy), src/render.ts
// Original Copyright (c) 2026 Canopy contributors, MIT License

import type { PromptRecord, RenderResult, Section } from "./types";
import { readStore, findLatest } from "./store";

/**
 * Thrown when a circular inheritance chain is detected.
 */
export class CircularInheritanceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CircularInheritanceError";
  }
}

/**
 * Thrown when the inheritance depth exceeds maxDepth.
 */
export class DepthExceededError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DepthExceededError";
  }
}

/**
 * Merge parent and child section trees via recursive deep-clone merge.
 *
 * Algorithm:
 *   - For each child section:
 *     • If body is empty AND no children → remove matching section from result (prune)
 *     • If a sibling with same name+level exists → deep-cloned override:
 *       - Replace body if non-empty
 *       - Recursively merge children if present
 *     • Otherwise → deep-clone and append
 *   - Parent order preserved; new child sections appended at end.
 *   - Match key is (name, level) — siblings only.
 */
export function mergeSections(parentSections: Section[], childSections: Section[]): Section[] {
  const result = deepCloneSections(parentSections);

  for (const childSection of childSections) {
    if (childSection.body === "" && (!childSection.children || childSection.children.length === 0)) {
      const idx = result.findIndex((s) => s.name === childSection.name && s.level === childSection.level);
      if (idx !== -1) result.splice(idx, 1);
      continue;
    }

    const existingIdx = result.findIndex((s) => s.name === childSection.name && s.level === childSection.level);
    if (existingIdx !== -1) {
      const existing = result[existingIdx]!;
      if (childSection.body !== "") existing.body = childSection.body;
      if (childSection.children && childSection.children.length > 0) {
        existing.children = mergeSections(existing.children || [], childSection.children);
      }
    } else {
      result.push(deepCloneSection(childSection));
    }
  }

  return result;
}

function deepCloneSection(section: Section): Section {
  return {
    name: section.name,
    body: section.body,
    level: section.level,
    children: section.children ? deepCloneSections(section.children) : undefined,
  };
}

function deepCloneSections(sections: Section[]): Section[] {
  return sections.map(deepCloneSection);
}

/**
 * Recursively resolve a prompt by name, merging all inherited sections and frontmatter.
 *
 * Algorithm:
 *   1. If name in visited → throw CircularInheritanceError
 *   2. If depth >= maxDepth → throw DepthExceededError
 *   3. Add name to visited
 *   4. Find prompt by name in store via findLatest
 *   5. If not found → throw Error
 *   6. Start with accumulated sections [] and frontmatter {}
 *   7. For each ancestor in extends (left-to-right):
 *      a. Recursively resolvePrompt
 *      b. mergeSections(accumulated, ancestorResult.sections)
 *      c. Shallow-merge ancestorResult.frontmatter
 *      d. Track ancestor in resolvedFrom
 *   8. Merge focal prompt's own sections on top of accumulated
 *   9. Shallow-merge focal prompt's frontmatter on top
 *   10. Remove name from visited (backtracking)
 *   11. Return result with focal name appended to resolvedFrom
 */
export async function resolvePrompt(
  storePath: string,
  name: string,
  maxDepth: number,
  depth: number = 0,
  visited?: Set<string>,
): Promise<RenderResult> {
  const _visited = visited ?? new Set<string>();

  // Step 1: cycle detection
  if (_visited.has(name)) {
    throw new CircularInheritanceError(
      `Circular inheritance detected: "${name}" already being resolved`,
    );
  }

  // Step 2: depth check
  if (depth >= maxDepth) {
    throw new DepthExceededError(
      `Inheritance depth exceeded (${maxDepth}) while resolving "${name}"`,
    );
  }

  // Step 3: add to visited
  _visited.add(name);

  // Step 4: find prompt
  const prompt = await findLatest(storePath, name);
  if (!prompt) {
    throw new Error(`Prompt "${name}" not found`);
  }

  // Step 6: start with empty accumulated
  let accumulatedSections: Section[] = [];
  let accumulatedFrontmatter: Record<string, unknown> = {};
  const resolvedFrom: string[] = [];

  // Step 7: process ancestors
  if (prompt.extends && prompt.extends.length > 0) {
    for (const ancestor of prompt.extends) {
      // Step 7a: recursively resolve ancestor
      const ancestorResult = await resolvePrompt(
        storePath,
        ancestor,
        maxDepth,
        depth + 1,
        _visited,
      );

      // Step 7b: merge sections
      accumulatedSections = mergeSections(accumulatedSections, ancestorResult.sections);

      // Step 7c: shallow-merge frontmatter (left-to-right)
      accumulatedFrontmatter = { ...accumulatedFrontmatter, ...ancestorResult.frontmatter };

      // Step 7d: track ancestor
      resolvedFrom.push(...ancestorResult.resolvedFrom);
    }
  }

  // Step 8: merge focal prompt's own sections on top
  accumulatedSections = mergeSections(accumulatedSections, prompt.sections);

  // Step 9: shallow-merge focal prompt's frontmatter as final override
  accumulatedFrontmatter = { ...accumulatedFrontmatter, ...prompt.frontmatter };

  // Step 10: backtracking — remove from visited
  _visited.delete(name);

  // Step 11: append focal name to resolvedFrom
  resolvedFrom.push(name);

  return {
    sections: accumulatedSections,
    frontmatter: accumulatedFrontmatter,
    resolvedFrom,
  };
}

/**
 * Topologically sort all prompts in the store using Kahn's algorithm.
 *
 * Returns a list of prompt names where parents always appear before their dependents.
 * Throws an error if a cycle is detected.
 *
 * Algorithm:
 *   1. Read all records, deduplicate to latest version per name
 *   2. Build adjacency list (parent → child edges)
 *   3. Compute in-degree for each node
 *   4. Queue all nodes with in-degree 0
 *   5. Process queue: decrement in-degree of dependents
 *   6. If result length < total nodes → cycle exists, throw error
 *   7. Return ordered list
 */
export async function topologicalSort(storePath: string): Promise<string[]> {
  // Step 1: read and deduplicate (keep latest version per name)
  const records = await readStore(storePath);
  const latestByNames = new Map<string, PromptRecord>();
  for (const record of records) {
    const existing = latestByNames.get(record.name);
    if (!existing || record.version > existing.version) {
      latestByNames.set(record.name, record);
    }
  }

  const nodes = Array.from(latestByNames.keys());
  if (nodes.length === 0) return [];

  // Step 2: build adjacency list and in-degree map
  const adjList = new Map<string, Set<string>>(); // parent → children
  const inDegree = new Map<string, number>();

  for (const node of nodes) {
    adjList.set(node, new Set());
    inDegree.set(node, 0);
  }

  for (const record of latestByNames.values()) {
    if (record.extends && record.extends.length > 0) {
      for (const parent of record.extends) {
        // Edge: parent → child (record.name)
        if (adjList.has(parent)) {
          adjList.get(parent)!.add(record.name);
        }
        inDegree.set(record.name, (inDegree.get(record.name) ?? 0) + 1);
      }
    }
  }

  // Step 3: compute in-degree for children (already done above)
  // Nodes with no extends have in-degree 0 (already initialized)

  // Step 4: queue all nodes with in-degree 0
  const queue: string[] = [];
  for (const node of nodes) {
    if ((inDegree.get(node) || 0) === 0) {
      queue.push(node);
    }
  }

  // Step 5: process queue
  const result: string[] = [];
  while (queue.length > 0) {
    const current = queue.shift()!;
    result.push(current);

    const children = adjList.get(current) || new Set();
    for (const child of children) {
      const newDegree = (inDegree.get(child) ?? 0) - 1;
      inDegree.set(child, newDegree);
      if (newDegree === 0) {
        queue.push(child);
      }
    }
  }

  // Step 6: check for cycle
  if (result.length < nodes.length) {
    // Find cycle members (nodes not in result)
    const cycleMembers = nodes.filter((n) => !result.includes(n));
    throw new CircularInheritanceError(
      `Circular dependency detected among: ${cycleMembers.join(", ")}`,
    );
  }

  // Step 7: return ordered list
  return result;
}
