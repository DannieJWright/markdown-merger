# Hierarchical Section Parsing — Design Spec

**Date:** 2026-07-22
**Status:** Approved

## Overview

Extend the parsing system to support arbitrary nesting depth via multi-level markdown headings (`##`, `###`, `####`, etc.). The current system only recognizes `##` as section boundaries — all deeper headings pass through as plain text. With this change, subsections become first-class nodes in a hierarchical tree that can be individually targeted during inheritance merging.

### Motivation

A child agent may want to replace only a `###` subsection within an inherited `##` section, without overwriting sibling subsections or the parent section's body text. Currently this is impossible — sections are flat and matched by name, so `## Role` is the smallest override unit.

## Context

### Existing System

- `parseSections()` in `src/frontmatter.ts` splits a body on `^##\s+(.+)$` only, producing flat `Section[]`
- `Section` is currently `{name: string, body: string}`
- `mergeSections()` in `src/resolve.ts` does level-by-level override/append/remove by matching on `name`
- `renderMarkdown()` in `src/frontmatter.ts` and `renderPromptText()` in `src/emit.ts` flatten sections to `## {Name}\n\n{body}\n`
- Fenced code block detection already prevents false heading matches inside code

### Key Files

- `src/types.ts` — `Section` interface and other data types
- `src/frontmatter.ts` — `parseSections()`, `renderMarkdown()`
- `src/resolve.ts` — `mergeSections()` and `resolvePrompt()`
- `src/emit.ts` — `renderPromptText()` for final markdown output
- `src/frontmatter.test.ts`, `src/resolve.test.ts`, `src/emit.test.ts` — existing tests

## Design

### Data Model

```typescript
interface Section {
  name: string;          // lowercased hyphenated heading, e.g. "role"
  body: string;          // text between this heading and first child heading (or end of parent)
  children?: Section[];  // subsections at the next heading level
  level: number;         // 1 for ##, 2 for ###, 3 for ####, etc.
}
```

The `level` field encodes which markdown heading level the section corresponds to: level 1 = `##` (two `#`), level 2 = `###` (three `#`), etc. A section's `children` hold sections at `level + 1`. Text between a section's heading and its first child heading goes into `body`.

### Parsing

`parseSections()` becomes a recursive descent parser using a call stack of heading levels.

```text
For each line:
  1. Track fenced code blocks ( ``` / ~~~ toggle inFencedBlock)
  2. If inFencedBlock, accumulate into current scope's body and continue
  3. If line matches heading pattern /^#{2,6}\s+(.+)$/ and not in code block:
     a. Determine level (number of # minus 1)
     b. Create new Section with that level and captured name
     c. If level == currentLevel:
        - Push the section as a sibling at the current parent level
     d. If level < currentLevel:
        - Pop back up the stack until we find the correct parent for this level
        - Push the section at that parent level recursively
     e. If level > currentLevel:
        - Append as child of current section
        - Push onto stack, descend into deeper parsing
  4. If line is not a heading, accumulate into current scope's body
```

**Heading level regex:** `/^#{2,6}\s+(.+)$/` — accepts `##` through `######`. Headings with fewer than 2 `#` (`# Top`) are ignored and treated as plain text. Headings with more than 6 `#` are ignored (markdown spec limit).

**Backward compatibility:** Existing documents that only use `##` will parse identically — all sections will have `level: 1` with no children.

### Merging

`mergeSections()` becomes recursive. At each level:

1. **Body text:** If the child section's `body` is non-empty, it replaces the parent's body. If empty (or absent), the parent's body carries over.

2. **Children merge (by `name`):**
  - Child has subsection with matching `name` and non-empty body or children → recurse merge on that subsection (body + children)
    - Child has subsection with matching `name` and empty body and no children → remove parent's subsection and all its descendants
   - Child has subsection with `name` not found in parent → append as new child at end
   - Parent has subsection with `name` not in child → carries over unchanged

3. **Merge order:** Children are processed in order. Parent order is preserved; new children are appended at the end.

4. **Level alignment:** Merge only matches siblings at the same level. A child's `### Identity` merged into `## Role`'s children list. Cross-level matching is NOT performed.

> **Note:** A child section with empty body but with children will NOT clear the parent's body text — the parent's body carries over. This is intentional: removal requires both empty body AND no children. If you need to clear a section's body while keeping its subsections, remove and re-add the section entirely.

### Rendering

Both `renderMarkdown()` and `renderPromptText()` walk the tree depth-first, emitting:

```
#{level+1} {PascalCase name}

{body}

{recursive render of each child}
```

Output is NOT indented. The result looks like a normal markdown file. A blank line separates sibling sections.

### Error Handling

- Invalid heading nesting (e.g., skipping from `##` to `####` without a `###` in between) is allowed. The gap just means intermediate levels are skipped in the tree.
- Headings that exceed level 6 (more than 6 `#`) are treated as plain text.

## Testing

### Parse Tests (in `src/frontmatter.test.ts`)

- `###` subsections nested under `##`
- `####` subsections nested under `###`
- Multiple siblings at the same level
- Mixed content: body text, subsections, more body text
- Fenced code blocks spanning across nested boundaries
- Heading level skipping (`##` → `####` with no `###`)
- Only `##` headings (backward compatibility, no children)

### Merge Tests (in `src/resolve.test.ts`)

- Child overrides single `###` subsection, siblings carry over
- Child removes `###` subsection (empty body), siblings carry over
- Child adds new `###` subsection, parent's children carry over
- Cross-level override: child specifies `## Role` body + `### Identity` body, parent's `### Behavior` carries over
- Deep nesting: `##` → `###` → `####`, override at level 3
- Grandchild removal cascades: removing `###` drops all `####` underneath

### Render Tests (in `src/emit.test.ts` and `src/frontmatter.test.ts`)

- Nested structure renders as flat markdown with correct heading levels
- No indentation in output
- Round-trip: parse → merge → render → parse again yields same structure
- Heading level counts in output match section levels

## Scope

### In Scope

- `Section` type change to recursive tree
- `parseSections()` recursive parser
- `mergeSections()` recursive merger
- `renderMarkdown()` and `renderPromptText()` recursive renderers
- Full test coverage for all three operations

### Out of Scope

- Changing the frontmatter YAML format
- Modifying the `extends` resolution or cycle detection
- Altering the JSONL store schema (sections are stringified at import time)
- CLI argument changes
- Maximum nesting limit enforcement
