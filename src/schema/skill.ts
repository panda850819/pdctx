export type SkillDomain = "personal" | "work" | "shared";
export type SkillClassification = "read" | "write" | "exec" | "hybrid";

export interface SkillFrontmatter {
  name?: string;
  description?: string;
  reads?: string[];
  writes?: string[];
  forbids?: string[];
  domain?: SkillDomain;
  classification?: SkillClassification;
  [key: string]: unknown;
}

export const DEFAULT_SKILL_CONTEXT = {
  domain: "shared" as const,
  classification: "read" as const,
  reads: [] as string[],
  writes: [] as string[],
  forbids: [] as string[],
};

export const SKILL_DOMAINS: SkillDomain[] = ["personal", "work", "shared"];
export const SKILL_CLASSIFICATIONS: SkillClassification[] = ["read", "write", "exec", "hybrid"];
