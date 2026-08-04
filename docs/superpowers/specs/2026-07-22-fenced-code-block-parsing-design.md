# Ignore Fenced Code Blocks in parseSections

## Problem

`parseSections()` in `src/frontmatter.ts` splits markdown content on `##` headings using the regex `^##\s+(.+)$`. This regex fires on any line starting with `##`, including lines inside fenced code blocks (``` or ~~~).

Example from `.evo/agents-root/input/system/base.md`:
```markdown
## Role
You are a helpful AI assistant.

```markdown
## This shouldn't be split on
If this shows in the output, then there is a problem with our parsing logic.
```
```

The `## This shouldn't be split on` line inside the code block is incorrectly treated as a section heading, creating a corrupted section.

## Root Cause

`parseSections()` iterates lines sequentially with no awareness of fenced code block boundaries. Every line is tested against the heading regex regardless of context.

## Design

Add a `inFencedBlock` boolean flag to the `parseSections` loop:
- Toggle `true` when encountering a line matching a fence opener (````` ``` ``, `~~~`)
- Toggle `false` when the fence closes
- Skip heading regex matches while `inFencedBlock` is `true`

Inline code (single `` ` `` backticks) is a known limitation and out of scope for this fix — it would require per-character backtick state tracking and the edge case of `` `## x` `` at line start is extremely rare in agent markdown files.

## Scope

- Single function change: `parseSections()` in `src/frontmatter.ts`
- Add failing test in `src/frontmatter.test.ts`
- No API or signature changes
