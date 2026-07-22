# Fix Output Section Spacing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add blank lines between consecutive sections in rendered markdown output so section ends are not smashed against the next section header.

**Architecture:** Single-line change in `src/emit.ts` — change the trailing `\n` after each section body to `\n\n`. TDD: write a test that asserts blank-line separation between consecutive sections, verify it fails, apply the fix, verify it passes.

**Tech Stack:** TypeScript, Bun test runner

## Global Constraints

- Test runner: `bun test`
- Test file: `src/emit.test.ts` (follows existing patterns: `bun:test` imports, `updateOrCreate` for store setup, temp directory with cleanup)
- Implementation file: `src/emit.ts`, line 63 — section rendering loop
- Branch: `fix/output-spacing`

---

### Task 1: Write failing test for section spacing

**Files:**
- Modify: `src/emit.test.ts` — add new test inside the `describe("renderPromptText")` block

**Interfaces:**
- Consumes: `renderPromptText` from `./emit`, `updateOrCreate` from `./store`
- Produces: failing test that verifies blank-line separation between sections

- [ ] **Step 1: Write the failing test**

Add the following test inside the existing `describe("renderPromptText")` block in `src/emit.test.ts`, after the existing tests (after line 54, before the closing `});`):

```typescript
  test("has blank line between consecutive sections", async () => {
    await updateOrCreate(storePath, "multi-section", "test", {
      sections: [
        { name: "role", body: "You are a coding assistant." },
        { name: "constraints", body: "Think carefully." },
      ],
      frontmatter: {},
    });
    const output = await renderPromptText(storePath, "multi-section", 5);
    // There should be a blank line between the end of one section's body
    // and the start of the next section header.
    expect(output).toContain("You are a coding assistant.\n\n## Constraints");
  });
```

This test creates an agent with two sections and asserts that between the end of the first section's body and the second section's `##` header, there are two newlines (i.e., a blank line).

- [ ] **Step 2: Run test to verify it fails**

Run:
```bash
bun test src/emit.test.ts --test-name-pattern "has blank line between consecutive sections"
```

Expected: FAIL — the test will find `\n## Constraints` (single newline) instead of `\n\n## Constraints` (blank line).

If the test passes immediately, the test is wrong — investigate.

If the test errors (not fails), fix the syntax error and re-run until it produces a clean FAIL.

- [ ] **Step 3: Write minimal implementation to make the test pass**

In `src/emit.ts`, line 63, change:
```typescript
    output += `## ${title}\n\n${section.body}\n`;
```
to:
```typescript
    output += `## ${title}\n\n${section.body}\n\n`;
```

This adds a second `\n` at the end of each section, producing a blank line before the next section header.

- [ ] **Step 4: Run test to verify it passes**

Run:
```bash
bun test src/emit.test.ts --test-name-pattern "has blank line between consecutive sections"
```

Expected: PASS.

Then run the full test suite to ensure no regressions:
```bash
bun test
```

Expected: All tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/emit.test.ts src/emit.ts
git commit -m "fix: add blank line between sections in rendered markdown output"
```
