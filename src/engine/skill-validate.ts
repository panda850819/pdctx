import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { basename, join } from "node:path";
import {
  DEFAULT_SKILL_CONTEXT,
  SKILL_CLASSIFICATIONS,
  SKILL_DOMAINS,
  type SkillFrontmatter,
} from "../schema/skill.ts";

export type SkillStatus = "pass" | "warn" | "fail";

export interface SkillIssue {
  skill: string;
  path: string;
  status: SkillStatus;
  reasons: string[];
}

export interface SkillValidateResult {
  scanned: number;
  pass: SkillIssue[];
  warn: SkillIssue[];
  fail: SkillIssue[];
  withContextMetadata: number;
  withoutContextMetadata: number;
}

const REQUIRED_FIELDS = ["name", "description"] as const;
const CONTEXT_FIELDS = ["reads", "writes", "forbids", "domain", "classification"] as const;
const ACCESS_LIST_FIELDS = ["reads", "writes", "forbids"] as const;
const ACCESS_SOURCES = ["vault", "repo", "file", "cli", "mcp", "runtime"] as const;

type FrontmatterValue = string | string[];

function stripWrappingQuotes(val: string): string {
  if (
    (val.startsWith('"') && val.endsWith('"')) ||
    (val.startsWith("'") && val.endsWith("'"))
  ) {
    return val.slice(1, -1);
  }
  return val;
}

export function parseFrontmatter(content: string): SkillFrontmatter | null {
  const norm = content.replace(/\r\n/g, "\n");
  if (!norm.startsWith("---\n")) return null;
  const end = norm.indexOf("\n---", 4);
  if (end === -1) return null;
  const yaml = norm.slice(4, end);
  const result: Record<string, FrontmatterValue> = {};
  const lines = yaml.split("\n");
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (line.trim() === "" || line.trimStart().startsWith("#")) {
      i++;
      continue;
    }
    const m = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (!m) {
      i++;
      continue;
    }
    const key = m[1];
    let val = m[2].trim();
    if (val === "|" || val === ">" || val === "|-" || val === ">-") {
      const collected: string[] = [];
      i++;
      while (i < lines.length) {
        const next = lines[i];
        if (next === "" || /^\s/.test(next)) {
          collected.push(next.replace(/^  /, ""));
          i++;
        } else {
          break;
        }
      }
      val = collected.join("\n").trim();
      result[key] = val;
    } else if (val === "") {
      const collected: string[] = [];
      i++;
      while (i < lines.length) {
        const next = lines[i];
        const listItem = next.match(/^\s*-\s+(.*)$/);
        if (!listItem) break;
        collected.push(stripWrappingQuotes(listItem[1].trim()));
        i++;
      }
      result[key] = collected;
    } else {
      val = stripWrappingQuotes(val);
      i++;
      result[key] = val === "[]" ? [] : val;
    }
  }
  return result as SkillFrontmatter;
}

function scalar(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function hasContextMetadata(fm: SkillFrontmatter): boolean {
  return CONTEXT_FIELDS.some((field) => fm[field] !== undefined);
}

function validateAccessEntry(field: string, entry: string): string | undefined {
  if (entry.length === 0) return `${field} contains empty access entry`;
  if (entry.includes("\0")) return `${field} entry contains NUL byte: ${entry}`;

  const match = entry.match(/^([a-z][a-z0-9_-]*):\s+(.+)$/);
  if (!match) return `${field} entry must use "<source>: <target>": ${entry}`;

  const source = match[1];
  const target = stripWrappingQuotes(match[2].trim());
  if (!(ACCESS_SOURCES as readonly string[]).includes(source)) {
    return `${field} entry has unknown source "${source}": ${entry}`;
  }
  if (target.length === 0) return `${field} entry has empty target: ${entry}`;
  if (target.includes("\0")) return `${field} entry target contains NUL byte: ${entry}`;

  if (source === "vault" || source === "repo" || source === "file") {
    if (target.includes("..")) return `${field} path target must not contain "..": ${entry}`;
    if (target.startsWith("~")) return `${field} path target must not start with "~": ${entry}`;
    if (target.startsWith("/") && source !== "file") {
      return `${field} absolute paths are only allowed for file entries: ${entry}`;
    }
  }

  return undefined;
}

function validateContextMetadata(fm: SkillFrontmatter, skill: string): { hasMetadata: boolean; reasons: string[]; warnReasons: string[] } {
  const hasMetadata = hasContextMetadata(fm);
  if (!hasMetadata) {
    return {
      hasMetadata,
      reasons: [
        `skill ${skill} has no context metadata; treating as domain=${DEFAULT_SKILL_CONTEXT.domain}, classification=${DEFAULT_SKILL_CONTEXT.classification}`,
      ],
      warnReasons: [],
    };
  }

  const reasons: string[] = [];
  const warnReasons: string[] = [];
  for (const field of ACCESS_LIST_FIELDS) {
    const value = fm[field];
    if (value === undefined) continue;
    if (!Array.isArray(value) || value.some((x) => typeof x !== "string")) {
      reasons.push(`${field} must be string[]`);
      continue;
    }
    for (const entry of value) {
      // vault: with absolute path is a warning; the correct form is file: for cross-vault paths
      const absVaultMatch = entry.match(/^vault:\s+(\/.*)/);
      if (absVaultMatch) {
        warnReasons.push(`${field} vault: entry uses absolute path; use file: instead: ${entry}`);
        continue;
      }
      const reason = validateAccessEntry(field, entry);
      if (reason) reasons.push(reason);
    }
  }

  if (fm.domain !== undefined) {
    if (typeof fm.domain !== "string" || !(SKILL_DOMAINS as readonly string[]).includes(fm.domain)) {
      reasons.push(`domain must be one of ${SKILL_DOMAINS.join(", ")}`);
    }
  }

  if (fm.classification !== undefined) {
    if (
      typeof fm.classification !== "string" ||
      !(SKILL_CLASSIFICATIONS as readonly string[]).includes(fm.classification)
    ) {
      reasons.push(`classification must be one of ${SKILL_CLASSIFICATIONS.join(", ")}`);
    }
  }

  return { hasMetadata, reasons, warnReasons };
}

export function validateSkill(skillDir: string): SkillIssue {
  const skill = basename(skillDir);
  const skillMdPath = join(skillDir, "SKILL.md");
  if (!existsSync(skillMdPath)) {
    return { skill, path: skillMdPath, status: "fail", reasons: ["SKILL.md not found"] };
  }
  const content = readFileSync(skillMdPath, "utf-8");
  const fm = parseFrontmatter(content);
  if (!fm) {
    return {
      skill,
      path: skillMdPath,
      status: "fail",
      reasons: ["no frontmatter (file missing leading `---` block)"],
    };
  }
  const reasons: string[] = [];
  let level: SkillStatus = "pass";

  for (const f of REQUIRED_FIELDS) {
    const value = scalar(fm[f]);
    if (!value || value.trim() === "") {
      reasons.push(`required field missing or empty: ${f}`);
      level = "fail";
    }
  }

  if (level !== "fail") {
    const name = scalar(fm.name);
    if (name && name !== skill) {
      if (name === `pandastack:${skill}` || name === `ps-${skill}`) {
        reasons.push(
          `name "${name}" carries consumer-side prefix; should be plain folder name "${skill}"`,
        );
      } else {
        reasons.push(`name "${name}" does not match folder name "${skill}"`);
      }
      level = "warn";
    }
  }

  const metadata = validateContextMetadata(fm, skill);
  if (metadata.warnReasons.length > 0) {
    reasons.push(...metadata.warnReasons);
    if (level !== "fail") level = "warn";
  }
  if (metadata.reasons.length > 0) {
    reasons.push(...metadata.reasons);
    level = metadata.hasMetadata ? "fail" : level === "fail" ? "fail" : "warn";
  }

  return { skill, path: skillMdPath, status: level, reasons };
}

function collectSkillDirs(stackPath: string): string[] {
  const out: string[] = [];

  const direct = join(stackPath, "skills");
  if (existsSync(direct) && statSync(direct).isDirectory()) {
    for (const entry of readdirSync(direct, { withFileTypes: true })) {
      if (entry.isDirectory()) out.push(join(direct, entry.name));
    }
  }

  const plugins = join(stackPath, "plugins");
  if (existsSync(plugins) && statSync(plugins).isDirectory()) {
    for (const plugin of readdirSync(plugins, { withFileTypes: true })) {
      if (!plugin.isDirectory()) continue;
      const pluginSkills = join(plugins, plugin.name, "skills");
      if (existsSync(pluginSkills) && statSync(pluginSkills).isDirectory()) {
        for (const entry of readdirSync(pluginSkills, { withFileTypes: true })) {
          if (entry.isDirectory()) out.push(join(pluginSkills, entry.name));
        }
      }
    }
  }

  return out;
}

export function validateStack(stackPath: string): SkillValidateResult {
  const result: SkillValidateResult = {
    scanned: 0,
    pass: [],
    warn: [],
    fail: [],
    withContextMetadata: 0,
    withoutContextMetadata: 0,
  };
  const skillDirs = collectSkillDirs(stackPath);
  for (const dir of skillDirs) {
    const issue = validateSkill(dir);
    const content = existsSync(issue.path) ? readFileSync(issue.path, "utf-8") : "";
    const fm = content ? parseFrontmatter(content) : null;
    if (fm && hasContextMetadata(fm)) result.withContextMetadata++;
    else result.withoutContextMetadata++;
    result.scanned++;
    result[issue.status].push(issue);
  }
  return result;
}

export function isStackPath(stackPath: string): boolean {
  if (existsSync(join(stackPath, "skills"))) return true;
  if (existsSync(join(stackPath, "plugins"))) return true;
  return false;
}
