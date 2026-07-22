import { describe, test, expect } from "bun:test";
import { extractFrontmatter, parseSections, renderMarkdown } from "./frontmatter";

describe("extractFrontmatter", () => {
  test("returns empty metadata when no frontmatter", () => {
    const { metadata, body } = extractFrontmatter("hello world");
    expect(metadata).toEqual({});
    expect(body).toBe("hello world");
  });

  test("parses boolean values", () => {
    const content = `---\nabstract: true\nname: test\n---\nbody`;
    const { metadata } = extractFrontmatter(content);
    expect(metadata.abstract).toBe(true);
  });

  test("parses array values", () => {
    const content = `---\nextends: [system/base, traits/caution]\n---\nbody`;
    const { metadata } = extractFrontmatter(content);
    expect(metadata.extends).toEqual(["system/base", "traits/caution"]);
  });

  test("parses indented - item array syntax", () => {
    const content = `---\nextends:\n  - system/base\n  - traits/caution\n---\nbody`;
    const { metadata } = extractFrontmatter(content);
    expect(metadata.extends).toEqual(["system/base", "traits/caution"]);
  });

  test("returns body after frontmatter", () => {
    const content = `---\nname: test\n---\nSome body content here`;
    const { body } = extractFrontmatter(content);
    expect(body).toBe("Some body content here");
  });
});

describe("parseSections", () => {
  test("splits on ## headings", () => {
    const body = "## Role\nYou are great.\n## Constraints\nBe nice.";
    const sections = parseSections(body);
    expect(sections).toHaveLength(2);
    expect(sections[0]!.name).toBe("role");
    expect(sections[0]!.body).toBe("You are great.");
    expect(sections[1]!.name).toBe("constraints");
  });

  test("content before first ## becomes intro", () => {
    const body = "Initial text.\n## Role\nYou are great.";
    const sections = parseSections(body);
    expect(sections[0]!.name).toBe("intro");
    expect(sections[0]!.body).toBe("Initial text.");
  });

  test("lowercases and hyphenates names", () => {
    const body = "## Quality Gates\nRun tests.";
    const sections = parseSections(body);
    expect(sections[0]!.name).toBe("quality-gates");
  });
});

describe("renderMarkdown", () => {
  test("renders frontmatter as YAML block", () => {
    const result = renderMarkdown({ name: "Test", mode: "subagent" }, [{ name: "role", body: "Helper" }]);
    expect(result).toContain("---");
    expect(result).toContain("mode: subagent");
  });

  test("omits frontmatter block when no keys", () => {
    const result = renderMarkdown({}, [{ name: "role", body: "Helper" }]);
    expect(result).not.toContain("---");
  });

  test("renders section names in Pascal Case with spaces", () => {
    const result = renderMarkdown({}, [{ name: "quality-gates", body: "Run tests." }]);
    expect(result).toContain("## Quality Gates");
  });
});
