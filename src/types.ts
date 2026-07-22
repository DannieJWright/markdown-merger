export interface Section {
  name: string;
  body: string;
}

export interface PromptRecord {
  id: string;
  name: string;
  version: number;
  sections: Section[];
  extends?: string[];
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
  emitDir: string;
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
  emitDir: "output-agents",
  rootDirs: [".evo/agents-root/input"],
};
