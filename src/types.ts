export interface Section {
  name: string;
  body: string;
  level?: number;
  children?: Section[];
}

export interface PromptRecord {
  id: string;
  name: string;
  version: number;
  sections: Section[];
  extends?: string[];
  type?: string;
  frontmatter: Record<string, unknown>;
  abstract: boolean;
  status: "draft" | "active";
  createdAt: string;
  updatedAt: string;
}

export interface Config {
  project: string;
  version: string;
  maxInheritDepth: number;
  storeFile: string;
  emitDirs: Record<string, string>;
  rootDirs: string[];
}

export interface RenderResult {
  sections: Section[];
  frontmatter: Record<string, unknown>;
  resolvedFrom: string[];
}

export const DEFAULT_MAX_INHERIT_DEPTH = 5;

export const DEFAULT_CONFIG: Omit<Config, "project" | "version"> = {
  maxInheritDepth: DEFAULT_MAX_INHERIT_DEPTH,
  storeFile: "prompts.jsonl",
  emitDirs: { default: "output" },
  rootDirs: [".evo/agents-root/input"],
};
