import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { basename, join } from "node:path";

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
}

const REQUIRED_FIELDS = ["name", "description"] as const;

export function parseFrontmatter(content: string): Record<string, string> | null {
  const norm = content.replace(/\r\n/g, "\n");
  if (!norm.startsWith("---\n")) return null;
  const end = norm.indexOf("\n---", 4);
  if (end === -1) return null;
  const yaml = norm.slice(4, end);
  const result: Record<string, string> = {};
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
    } else {
      if (
        (val.startsWith('"') && val.endsWith('"')) ||
        (val.startsWith("'") && val.endsWith("'"))
      ) {
        val = val.slice(1, -1);
      }
      i++;
    }
    result[key] = val;
  }
  return result;
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
    if (!fm[f] || fm[f].trim() === "") {
      reasons.push(`required field missing or empty: ${f}`);
      level = "fail";
    }
  }

  if (level !== "fail") {
    const name = fm.name;
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
  const result: SkillValidateResult = { scanned: 0, pass: [], warn: [], fail: [] };
  const skillDirs = collectSkillDirs(stackPath);
  for (const dir of skillDirs) {
    const issue = validateSkill(dir);
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
