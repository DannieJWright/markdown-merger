import { describe, test, expect } from "bun:test";
import { extractFrontmatter, parseSections, renderMarkdown } from "./frontmatter";
import type { Section } from "./types";

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

  test("ignores ## headings inside fenced code blocks", () => {
    const body = [
      "## Role",
      "You are helpful.",
      "",
      "```markdown",
      "## This Should Be Ignored",
      "Nested content.",
      "```",
      "",
      "## Constraints",
      "Be safe.",
    ].join("\n");
    const sections = parseSections(body);
    expect(sections).toHaveLength(2);
    expect(sections[0]!.name).toBe("role");
    expect(sections[1]!.name).toBe("constraints");
  });

  test("ignores ## headings inside tilde fenced code blocks", () => {
    const body = [
      "## Role",
      "You are helpful.",
      "",
      "~~~",
      "## Not a heading",
      "~~~",
      "",
      "## Constraints",
      "Be safe.",
    ].join("\n");
    const sections = parseSections(body);
    expect(sections).toHaveLength(2);
  });

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
});
