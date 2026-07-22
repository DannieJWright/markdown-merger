# Hierarchical Section Parsing — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend `Section` to a recursive tree with `level` and `children`, rewrite `parseSections`, `mergeSections`, and renderers to operate recursively.

**Architecture:** Recursive descent parser. Recursive deep-clone merge. Depth-first renderer.

**Tech Stack:** Bun runtime, `bun:test`, TypeScript. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-07-22-hierarchical-section-parsing-design.md`

## Requirements

- **Branch:** Create `feat/hierarchical-section-parsing` from `main` before any implementation. Do NOT work on `main`.
- **Deepwork:** Create `.slim/deepwork/hierarchical-parsing.md`. Oracle review gates after Task 2 and Task 3.
- **SDD:** Fresh implementer per task, task-brief, report, task-reviewer, ledger at `.superpowers/sdd/progress.md`.
- **TDD:** Failing tests first, confirm failure, implement to pass. `bun test` + `bunx tsc --noEmit` after every step.
- **Commit:** After every task with descriptive messages.

## Global Constraints

1. No indentation in rendered output
2. Heading regex: `/^#{2,6}\s+(.+)$/`
3. `{name, body}` flat sections must still compile
4. Merge only matches siblings at same level
5. Removal: empty body + no children removes subtree; empty body + children merges recursively
6. Heading level skipping allowed
7. Fence toggle: `/^(`\`\`\`|~~~)/`
8. Intro section unchanged
9. Name normalization: `.toLowerCase().replace(/\s+/g, '-')`

---

## File Map

```
src/types.ts                    — Section type (Task 1)
src/frontmatter.ts              — parseSections + renderMarkdown (Task 2, 4)
src/resolve.ts                  — mergeSections (Task 3)
src/emit.ts                     — renderPromptText (Task 4)
src/frontmatter.test.ts         — parse + render tests (Task 2, 4)
src/resolve.test.ts             — merge tests (Task 3)
src/emit.test.ts                — emit render tests (Task 4)
src/import.test.ts              — import integration (Task 5)
```

---

### Task 1: Update Section type

**Files:** Modify `src/types.ts:1-4`
**Produces:** `Section` with optional `level?: number` and `children?: Section[]`

- [ ] **Step 1: Replace `src/types.ts:1-4`**

```typescript
export interface Section {
  name: string;
  body: string;
  level?: number;
  children?: Section[];
}
```

- [ ] **Step 2: `bunx tsc --noEmit`** — Expected: PASS
- [ ] **Step 3: `bun test`** — Expected: All existing tests pass
- [ ] **Step 4: Commit**

```bash
git add src/types.ts
git commit -m "feat(types): add level and children to Section interface"
```

---

### Task 2: Rewrite parseSections() as recursive descent parser

**Files:** Modify `src/frontmatter.ts:91-158`, `src/frontmatter.test.ts`
**Consumes:** `Section` from Task 1
**Produces:** `Section[]` tree with `level`, `children`, `body`

- [ ] **Step 1: Write failing tests in `src/frontmatter.test.ts` (inside existing `describe("parseSections")`)

```typescript
test("parses ### subsections nested under ##", () => {
  const sections = parseSections("## Role\nIntro text.\n### Identity\nI am an AI.\n### Behavior\nBe helpful.");
  expect(sections).toHaveLength(1);
  expect(sections[0]!.name).toBe("role");
  expect(sections[0]!.level).toBe(1);
  expect(sections[0]!.body).toBe("Intro text.");
  expect(sections[0]!.children).toHaveLength(2);
  expect(sections[0]!.children![0]!.name).toBe("identity");
  expect(sections[0]!.children![0]!.level).toBe(2);
  expect(sections[0]!.children![0]!.body).toBe("I am an AI.");
  expect(sections[0]!.children![1]!.name).toBe("behavior");
  expect(sections[0]!.children![1]!.body).toBe("Be helpful.");
});

test("parses #### nested under ###", () => {
  const sections = parseSections("## Role\n\n### Identity\n\n#### Primary\nMain identity.\n#### Secondary\nOther.");
  expect(sections[0]!.children).toHaveLength(1);
  const id = sections[0]!.children![0]!;
  expect(id.body).toBe("");
  expect(id.children![0]!.name).toBe("primary");
  expect(id.children![0]!.level).toBe(3);
  expect(id.children![0]!.body).toBe("Main identity.");
});

test("multiple ### siblings under ##", () => {
  const sections = parseSections("## Role\n\n### A\nA.\n### B\nB.\n### C\nC.");
  expect(sections[0]!.children).toHaveLength(3);
});

test("body text before children and text after children", () => {
  const sections = parseSections("## Role\nIntro.\n### Identity\nID.\nAfter children.");
  expect(sections[0]!.body).toContain("Intro.");
  expect(sections[0]!.body).toContain("After children.");
  expect(sections[0]!.children!.length).toBe(1);
});

test("ignores headings inside fenced code at any depth", () => {
  const sections = parseSections("## Role\n### Identity\n```\n### Fake\n```\n## Constraints\nSafe.");
  expect(sections).toHaveLength(2);
  expect(sections[0]!.children).toHaveLength(1);
});

test("heading level skipping (## to ####)", () => {
  const sections = parseSections("## Role\nIntro.\n#### Deep\nDeep content.");
  expect(sections[0]!.children![0]!.level).toBe(3);
});

test("backward compat: only ## produces flat sections", () => {
  const sections = parseSections("## Role\nYou are great.\n## Constraints\nBe nice.");
  expect(sections).toHaveLength(2);
  expect(sections[0]!.children).toBeUndefined();
});

test("## A -> ### B -> ## C creates siblings", () => {
  const sections = parseSections("## A\nA.\n### B\nB.\n## C\nC.");
  expect(sections).toHaveLength(2);
  expect(sections[0]!.children).toHaveLength(1);
  expect(sections[1]!.name).toBe("c");
});

test("intro before first ## still works", () => {
  const sections = parseSections("Initial text.\n## Role\nYou are great.");
  expect(sections[0]!.name).toBe("intro");
  expect(sections[1]!.name).toBe("role");
});

test("3-level deep with body at each level", () => {
  const sections = parseSections("## Role\nR.\n### Identity\nI.\n#### Deep\nD.");
  expect(sections[0]!.body).toBe("R.");
  expect(sections[0]!.children![0]!.body).toBe("I.");
  expect(sections[0]!.children![0]!.children![0]!.body).toBe("D.");
});

test("returns empty array for empty document", () => {
  const sections = parseSections("");
  expect(sections).toHaveLength(0);
});

test("single-hash and overflow-hash headings treated as body text", () => {
  const sections = parseSections("# Top\nSome text.\n####### Too many\nAlso body.");
  expect(sections[0]!.name).toBe("intro");
  expect(sections[0]!.body).toContain("# Top");
  expect(sections[0]!.body).toContain("####### Too many");
  expect(sections).toHaveLength(1);
});

test("max heading level skip (## to ######)", () => {
  const sections = parseSections("## Role\nIntro.\n###### Deepest\nDeep content.");
  expect(sections[0]!.children![0]!.level).toBe(5);
  expect(sections[0]!.children![0]!.name).toBe("deepest");
  expect(sections[0]!.children![0]!.body).toBe("Deep content.");
});

test("multiple levels of skipping (## to #### to ######)", () => {
  const sections = parseSections("## Role\nR.\n#### Skip\nS.\n###### Deeper\nD.");
  expect(sections[0]!.children).toHaveLength(1);
  expect(sections[0]!.children![0]!.level).toBe(3);
  expect(sections[0]!.children![0]!.children).toHaveLength(1);
  expect(sections[0]!.children![0]!.children![0]!.level).toBe(5);
});
```

- [ ] **Step 2: `bun test src/frontmatter.test.ts --test-name-pattern "parses subsections nested"`** — Expected: FAIL

- [ ] **Step 3: Replace lines 91-158 of `src/frontmatter.ts`**

Replace the `parseSections` function (lines 91-158) with:

```typescript
const fenceRegex = /^(```|~~~)/;
const headingRegex = /^#{2,6}\s+(.+)$/;
const headingLevelRegex = /^#+/;

function headingName(text: string): string {
  return text.toLowerCase().replace(/\s+/g, "-");
}

/**
 * Parse child sections from lines[start..end-1] whose parent is at parentLevel.
 * Returns sections parsed at this level and the index past the last consumed line.
 */
function parseChildren(
  lines: string[],
  fenceState: boolean[],
  start: number,
  end: number,
  parentLevel: number,
): { sections: Section[]; nextLine: number } {
  const sections: Section[] = [];
  let line = start;

  while (line < end) {
    if (fenceState[line] || !lines[line]!.match(headingRegex)) {
      line++;
      continue;
    }

    const headerLine = lines[line]!;
    const match = headerLine.match(headingRegex);
    if (!match) { line++; continue; }

    const level = (headerLine.match(headingLevelRegex)![0]!.length) - 1;
    if (level <= parentLevel) break;

    const section: Section = {
      name: headingName(match[1]!),
      body: "",
      level,
    };

    // Look ahead for first child heading or sibling heading
    let bodyEnd = end;
    let childIdx = -1;

    for (let j = line + 1; j < end; j++) {
      if (fenceState[j]) continue;
      if (!lines[j]!.match(headingRegex)) continue;
      const jl = (lines[j]!.match(headingLevelRegex)![0]!.length) - 1;
      bodyEnd = j;
      if (jl > level) childIdx = j;
      break;
    }

    section.body = lines.slice(line + 1, bodyEnd).join("\n").trim();

    if (childIdx > 0) {
      const { sections: children, nextLine: nl } = parseChildren(lines, fenceState, childIdx, end, level);
      section.children = children;
      line = nl;

      // Collect trailing body after children
      const trailing: string[] = [];
      while (line < end) {
        if (fenceState[line]) { line++; continue; }
        const tm = lines[line]!.match(headingRegex);
        if (tm) {
          const tl = (lines[line]!.match(headingLevelRegex)![0]!.length) - 1;
          if (tl <= level) break;
        }
        trailing.push(lines[line]!);
        line++;
      }
      if (trailing.length > 0) {
        section.body += "\n\n" + trailing.join("\n").trim();
      }
    } else {
      line++;
    }

    sections.push(section);
  }

  return { sections, nextLine: line };
}

export function parseSections(body: string): Section[] {
  const lines = body.split("\n");

  // Pre-compute fence state for the entire document
  const fenceState: boolean[] = new Array(lines.length);
  let fence = false;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i]!.match(fenceRegex)) fence = !fence;
    fenceState[i] = fence;
  }

  // Phase 1: collect intro (text before first heading)
  let line = 0;
  while (line < lines.length) {
    if (fenceState[line]) { line++; continue; }
    if (lines[line]!.match(headingRegex)) break;
    line++;
  }

  const sections: Section[] = [];
  if (line > 0) {
    sections.push({
      name: "intro",
      body: lines.slice(0, line).join("\n").trim(),
      level: 0,
    });
  }

  // Phase 2: parse hierarchical tree
  const { sections: bodySections } = parseChildren(lines, fenceState, line, lines.length, 0);
  return [...sections, ...bodySections];
}
```

- [ ] **Step 4: `bun test src/frontmatter.test.ts`** — Expected: All 15 parseSections tests pass
- [ ] **Step 5: Commit**

```bash
git add src/frontmatter.ts src/frontmatter.test.ts
git commit -m "feat(parser): hierarchical recursive descent parser"
```

---

### Task 3: Rewrite mergeSections() as recursive merge

**Files:** Modify `src/resolve.ts:27-59`, `src/resolve.test.ts`
**Consumes:** `Section[]` trees from Task 2
**Produces:** Merged tree with override/append/remove

- [ ] **Step 1: Write failing tests in `src/resolve.test.ts` (inside existing `describe("mergeSections")`)**

```typescript
test("overrides ### subsection, siblings carry over", () => {
  const parent: Section[] = [{ name: "role", body: "role intro", level: 1, children: [
    { name: "identity", body: "parent identity", level: 2 },
    { name: "behavior", body: "parent behavior", level: 2 },
  ]}];
  const child: Section[] = [{ name: "role", body: "child role", level: 1, children: [
    { name: "identity", body: "child identity", level: 2 },
  ]}];
  const result = mergeSections(parent, child);
  expect(result[0]!.body).toBe("child role");
  expect(result[0]!.children).toHaveLength(2);
  expect(result[0]!.children![0]!.body).toBe("child identity");
  expect(result[0]!.children![1]!.body).toBe("parent behavior");
});

test("removes ### with empty body and no children", () => {
  const parent: Section[] = [{ name: "role", body: "intro", level: 1, children: [
    { name: "identity", body: "id", level: 2 },
    { name: "behavior", body: "behav", level: 2 },
  ]}];
  const child: Section[] = [{ name: "role", body: "", level: 1, children: [
    { name: "identity", body: "", level: 2 },
  ]}];
  const result = mergeSections(parent, child);
  expect(result[0]!.children).toHaveLength(1);
  expect(result[0]!.children![0]!.name).toBe("behavior");
});

test("empty body WITH children does NOT remove", () => {
  const parent: Section[] = [{ name: "role", body: "", level: 1, children: [
    { name: "identity", body: "parent id", level: 2, children: [
      { name: "primary", body: "parent primary", level: 3 },
    ]},
  ]}];
  const child: Section[] = [{ name: "role", body: "", level: 1, children: [
    { name: "identity", body: "", level: 2, children: [
      { name: "primary", body: "child primary", level: 3 },
    ]},
  ]}];
  const result = mergeSections(parent, child);
  expect(result[0]!.children![0]!.body).toBe("parent id");
  expect(result[0]!.children![0]!.children![0]!.body).toBe("child primary");
});

test("grandchild removal cascades", () => {
  const parent: Section[] = [{ name: "role", body: "", level: 1, children: [
    { name: "identity", body: "id", level: 2, children: [
      { name: "primary", body: "p", level: 3 },
      { name: "secondary", body: "s", level: 3 },
    ]},
  ]}];
  const child: Section[] = [{ name: "role", body: "", level: 1, children: [
    { name: "identity", body: "", level: 2 },
  ]}];
  const result = mergeSections(parent, child);
  expect(result[0]!.children).toHaveLength(0);
});

test("adds new ###, parent children carry over", () => {
  const parent: Section[] = [{ name: "role", body: "intro", level: 1, children: [
    { name: "identity", body: "id", level: 2 },
  ]}];
  const child: Section[] = [{ name: "role", body: "", level: 1, children: [
    { name: "capabilities", body: "can help", level: 2 },
  ]}];
  const result = mergeSections(parent, child);
  expect(result[0]!.children).toHaveLength(2);
  expect(result[0]!.children![1]!.name).toBe("capabilities");
});

test("deep nesting: override at #### level 3", () => {
  const parent: Section[] = [{ name: "role", body: "", level: 1, children: [
    { name: "identity", body: "parent id", level: 2, children: [
      { name: "primary", body: "parent primary", level: 3 },
      { name: "secondary", body: "parent secondary", level: 3 },
    ]},
  ]}];
  const child: Section[] = [{ name: "role", body: "", level: 1, children: [
    { name: "identity", body: "child id", level: 2, children: [
      { name: "primary", body: "child primary", level: 3 },
    ]},
  ]}];
  const result = mergeSections(parent, child);
  const id = result[0]!.children![0]!;
  expect(id.body).toBe("child id");
  expect(id.children).toHaveLength(2);
  expect(id.children![0]!.body).toBe("child primary");
  expect(id.children![1]!.body).toBe("parent secondary");
});

test("cross-level override: child ## Role body + ### Identity body, parent ### Behavior carries over", () => {
  const parent: Section[] = [{ name: "role", body: "parent role", level: 1, children: [
    { name: "identity", body: "parent identity", level: 2 },
    { name: "behavior", body: "parent behavior", level: 2 },
  ]}];
  const child: Section[] = [{ name: "role", body: "child role", level: 1, children: [
    { name: "identity", body: "child identity", level: 2 },
  ]}];
  const result = mergeSections(parent, child);
  expect(result[0]!.body).toBe("child role");
  expect(result[0]!.children).toHaveLength(2);
  expect(result[0]!.children![0]!.name).toBe("identity");
  expect(result[0]!.children![0]!.body).toBe("child identity");
  expect(result[0]!.children![1]!.name).toBe("behavior");
  expect(result[0]!.children![1]!.body).toBe("parent behavior");
});
```

- [ ] **Step 2: `bun test src/resolve.test.ts --test-name-pattern "overrides \`###`"`** — Expected: FAIL

- [ ] **Step 3: Replace `src/resolve.ts:27-59`**

```typescript
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
```

- [ ] **Step 4: `bun test src/resolve.test.ts`** — Expected: All 11 tests pass
- [ ] **Step 5: Commit**

```bash
git add src/resolve.ts src/resolve.test.ts
git commit -m "feat(resolve): recursive mergeSections with deep clone"
```

---

### Task 4: Rewrite renderers for hierarchical output

**Files:** Modify `src/frontmatter.ts:160-198`, `src/emit.ts:1-67`, both test files

- [ ] **Step 1: Add render tests in `src/frontmatter.test.ts` (inside `describe("renderMarkdown")`)**

```typescript
test("renders nested sections with correct heading levels", () => {
  const sections: Section[] = [{ name: "role", body: "Intro.", level: 1, children: [
    { name: "identity", body: "I am AI.", level: 2 },
    { name: "behavior", body: "Be kind.", level: 2 },
  ]}];
  const result = renderMarkdown({}, sections);
  expect(result).toContain("## Role");
  expect(result).toContain("### Identity");
  expect(result).toContain("### Behavior");
  expect(result).not.toMatch(/^  /m);
});

test("renders 3-level deep with ####", () => {
  const sections: Section[] = [{ name: "role", body: "R.", level: 1, children: [
    { name: "identity", body: "I.", level: 2, children: [
      { name: "primary", body: "P.", level: 3 },
    ]},
  ]}];
  const result = renderMarkdown({}, sections);
  expect(result).toContain("#### Primary");
});

test("round-trip: parse → render → parse yields equivalent structure", () => {
  const original = "## Role\nRole intro.\n### Identity\nI am AI.\n### Behavior\nBe kind.\n## Constraints\nDo not harm.";
  const firstParse = parseSections(original);
  const rendered = renderMarkdown({}, firstParse);
  const secondParse = parseSections(rendered);
  expect(secondParse).toHaveLength(firstParse.length);
  expect(secondParse[0]!.name).toBe(firstParse[0]!.name);
  expect(secondParse[0]!.level).toBe(firstParse[0]!.level);
  expect(secondParse[0]!.body).toBe(firstParse[0]!.body);
  expect(secondParse[0]!.children).toHaveLength(firstParse[0]!.children!.length);
  expect(secondParse[0]!.children![0]!.name).toBe(firstParse[0]!.children![0]!.name);
  expect(secondParse[0]!.children![0]!.body).toBe(firstParse[0]!.children![0]!.body);
  expect(secondParse[0]!.children![1]!.name).toBe(firstParse[0]!.children![1]!.name);
  expect(secondParse[0]!.children![1]!.body).toBe(firstParse[0]!.children![1]!.body);
  expect(secondParse[1]!.name).toBe(firstParse[1]!.name);
  expect(secondParse[1]!.body).toBe(firstParse[1]!.body);
});

test("round-trip: parse → render → parse preserves deep nesting (3 levels)", () => {
  const original = "## Role\nR.\n### Identity\nI.\n#### Primary\nP.";
  const firstParse = parseSections(original);
  const rendered = renderMarkdown({}, firstParse);
  const secondParse = parseSections(rendered);
  expect(secondParse[0]!.children![0]!.children).toBeDefined();
  expect(secondParse[0]!.children![0]!.children![0]!.name).toBe(firstParse[0]!.children![0]!.children![0]!.name);
  expect(secondParse[0]!.children![0]!.children![0]!.body).toBe(firstParse[0]!.children![0]!.children![0]!.body);
});
```

- [ ] **Step 2: Add test in `src/emit.test.ts` (inside `describe("renderPromptText")`)**

```typescript
test("renders nested sections with correct heading levels", async () => {
  await updateOrCreate(storePath, "nested", "test", {
    sections: [{ name: "role", body: "Intro.", level: 1, children: [
      { name: "identity", body: "I am an AI.", level: 2 },
      { name: "behavior", body: "Be helpful.", level: 2 },
    ]}],
    frontmatter: { name: "Nested Agent" },
  });
  const output = await renderPromptText(storePath, "nested", 5);
  expect(output).toContain("### Identity");
  expect(output).not.toMatch(/^  /m);
});
```

- [ ] **Step 3: Replace `src/frontmatter.ts:160-198` (renderMarkdown + shared helper)**

Export `sectionNameToPascalCase` from `frontmatter.ts` as the single source of truth for kebab-case → PascalCase conversion. `emit.ts` will import it.

```typescript
/**
 * Convert a kebab-case section name to PascalCase (Title Case).
 * Example: "quality-gates" → "Quality Gates", "role" → "Role"
 */
export function sectionNameToPascalCase(name: string): string {
  return name
    .split("-")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
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
  return result + "\n\n";
}

export function renderMarkdown(
  frontmatter: Record<string, unknown>,
  sections: Section[],
): string {
  let result = "";

  const relevantKeys = Object.keys(frontmatter).filter(
    (k) => k !== "extends" && k !== "abstract",
  );
  if (relevantKeys.length > 0) {
    result += "---\n";
    for (const key of relevantKeys) {
      const val = frontmatter[key];
      if (Array.isArray(val)) result += `${key}: [${val.join(", ")}]\n`;
      else if (typeof val === "boolean") result += `${key}: ${val ? "true" : "false"}\n`;
      else result += `${key}: ${val}\n`;
    }
    result += "---\n\n";
  }

  for (const section of sections) result += renderSection(section);
  return result;
}
```

- [ ] **Step 4: Replace `src/emit.ts:1-67` (renderPromptText — import shared helper)**

Add `import { sectionNameToPascalCase } from "./frontmatter";` at the top of `emit.ts` (after existing imports). Remove the local `sectionNameToPascalCase` function.

```typescript
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
```

- [ ] **Step 5: `bun test src/frontmatter.test.ts src/emit.test.ts`** — Expected: PASS
- [ ] **Step 6: Commit**

```bash
git add src/frontmatter.ts src/emit.ts src/frontmatter.test.ts src/emit.test.ts
git commit -m "feat(render): depth-first recursive renderers"
```

---

### Task 5: Full verification

- [ ] **Step 1: `bun test`** — All tests pass
- [ ] **Step 2: `bunx tsc --noEmit`** — No errors
- [ ] **Step 3: Fix any remaining issues** (existing `import.test.ts` uses `.name`/`.body` only — should pass)
- [ ] **Step 4: `bun test && bunx tsc --noEmit`** — Green
- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "test: verify full suite with hierarchical sections"
```

---

## Self-Review

**Spec coverage:** Section type (T1), recursive parser (T2), fenced blocks (T2), level skipping (T2), backward compat (T2), recursive merge (T3), removal cascade (T3), removal with children (T3), depth-first render (T4), no indentation (T4), existing tests pass (T5).

**No placeholders.** All code is complete TypeScript.

**Type consistency:** `level ?? 1` fallback everywhere. `children?.length` guarded. `deepCloneSection` propagates all fields.

**Existing test compat:** Flat `{name, body}` sections type-check (optional fields). Merge still matches by `name`. Removal by empty body still works (undefined children is falsy).

**Deduplication (oracle M3 finding):** `sectionNameToPascalCase` is defined once in `frontmatter.ts` and exported. `emit.ts` imports it instead of maintaining a duplicate. One source of truth for kebab-case → PascalCase conversion.
