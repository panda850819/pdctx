import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  isStackPath,
  parseFrontmatter,
  validateSkill,
  validateStack,
} from "./skill-validate.ts";

function setupStack(): string {
  const root = mkdtempSync(join(tmpdir(), "pdctx-skill-validate-"));
  mkdirSync(join(root, "skills"), { recursive: true });
  return root;
}

describe("parseFrontmatter", () => {
  test("parses inline scalar", () => {
    const fm = parseFrontmatter(
      "---\nname: foo\ndescription: bar\n---\n# body\n",
    );
    expect(fm?.name).toBe("foo");
    expect(fm?.description).toBe("bar");
  });

  test("parses pipe block scalar", () => {
    const fm = parseFrontmatter(
      "---\nname: foo\ndescription: |\n  line one\n  line two\n---\n",
    );
    expect(fm?.name).toBe("foo");
    expect(fm?.description).toBe("line one\nline two");
  });

  test("returns null for missing frontmatter", () => {
    expect(parseFrontmatter("# body without frontmatter")).toBeNull();
  });

  test("strips wrapping quotes", () => {
    const fm = parseFrontmatter(
      "---\nname: \"foo\"\ndescription: 'bar'\n---",
    );
    expect(fm?.name).toBe("foo");
    expect(fm?.description).toBe("bar");
  });

  test("ignores comments", () => {
    const fm = parseFrontmatter(
      "---\n# top comment\nname: foo\ndescription: bar\n---\n",
    );
    expect(fm?.name).toBe("foo");
  });
});

describe("validateSkill", () => {
  test("pass when name matches folder + description present", () => {
    const root = setupStack();
    try {
      const dir = join(root, "skills", "foo");
      mkdirSync(dir);
      writeFileSync(
        join(dir, "SKILL.md"),
        "---\nname: foo\ndescription: triggers on foo\n---\n# Foo\n",
      );
      const issue = validateSkill(dir);
      expect(issue.status).toBe("pass");
      expect(issue.reasons).toEqual([]);
    } finally {
      rmSync(root, { recursive: true });
    }
  });

  test("warn when name carries pandastack: prefix", () => {
    const root = setupStack();
    try {
      const dir = join(root, "skills", "foo");
      mkdirSync(dir);
      writeFileSync(
        join(dir, "SKILL.md"),
        "---\nname: pandastack:foo\ndescription: triggers on foo\n---\n",
      );
      const issue = validateSkill(dir);
      expect(issue.status).toBe("warn");
      expect(issue.reasons[0]).toContain("consumer-side prefix");
    } finally {
      rmSync(root, { recursive: true });
    }
  });

  test("warn when name carries ps- prefix", () => {
    const root = setupStack();
    try {
      const dir = join(root, "skills", "foo");
      mkdirSync(dir);
      writeFileSync(
        join(dir, "SKILL.md"),
        "---\nname: ps-foo\ndescription: triggers on foo\n---\n",
      );
      const issue = validateSkill(dir);
      expect(issue.status).toBe("warn");
    } finally {
      rmSync(root, { recursive: true });
    }
  });

  test("warn when name mismatches folder unrelatedly", () => {
    const root = setupStack();
    try {
      const dir = join(root, "skills", "foo");
      mkdirSync(dir);
      writeFileSync(
        join(dir, "SKILL.md"),
        "---\nname: bar\ndescription: triggers on bar\n---\n",
      );
      const issue = validateSkill(dir);
      expect(issue.status).toBe("warn");
      expect(issue.reasons[0]).toContain("does not match folder name");
    } finally {
      rmSync(root, { recursive: true });
    }
  });

  test("fail when missing frontmatter entirely", () => {
    const root = setupStack();
    try {
      const dir = join(root, "skills", "foo");
      mkdirSync(dir);
      writeFileSync(join(dir, "SKILL.md"), "# Foo\n\nbody only\n");
      const issue = validateSkill(dir);
      expect(issue.status).toBe("fail");
      expect(issue.reasons[0]).toContain("frontmatter");
    } finally {
      rmSync(root, { recursive: true });
    }
  });

  test("fail when description missing", () => {
    const root = setupStack();
    try {
      const dir = join(root, "skills", "foo");
      mkdirSync(dir);
      writeFileSync(
        join(dir, "SKILL.md"),
        "---\nname: foo\n---\n",
      );
      const issue = validateSkill(dir);
      expect(issue.status).toBe("fail");
      expect(issue.reasons.some((r) => r.includes("description"))).toBe(true);
    } finally {
      rmSync(root, { recursive: true });
    }
  });

  test("fail when name missing", () => {
    const root = setupStack();
    try {
      const dir = join(root, "skills", "foo");
      mkdirSync(dir);
      writeFileSync(
        join(dir, "SKILL.md"),
        "---\ndescription: hi\n---\n",
      );
      const issue = validateSkill(dir);
      expect(issue.status).toBe("fail");
      expect(issue.reasons.some((r) => r.includes("name"))).toBe(true);
    } finally {
      rmSync(root, { recursive: true });
    }
  });
});

describe("validateStack", () => {
  test("scans direct skills/ layout", () => {
    const root = setupStack();
    try {
      const dir = join(root, "skills", "alpha");
      mkdirSync(dir);
      writeFileSync(
        join(dir, "SKILL.md"),
        "---\nname: alpha\ndescription: a\n---\n",
      );
      const result = validateStack(root);
      expect(result.scanned).toBe(1);
      expect(result.pass.length).toBe(1);
    } finally {
      rmSync(root, { recursive: true });
    }
  });

  test("scans plugins/<plugin>/skills/ layout", () => {
    const root = mkdtempSync(join(tmpdir(), "pdctx-skill-stack-"));
    try {
      const dir = join(root, "plugins", "myplugin", "skills", "beta");
      mkdirSync(dir, { recursive: true });
      writeFileSync(
        join(dir, "SKILL.md"),
        "---\nname: beta\ndescription: b\n---\n",
      );
      const result = validateStack(root);
      expect(result.scanned).toBe(1);
      expect(result.pass.length).toBe(1);
    } finally {
      rmSync(root, { recursive: true });
    }
  });

  test("aggregates pass / warn / fail counts", () => {
    const root = setupStack();
    try {
      const ok = join(root, "skills", "ok");
      mkdirSync(ok);
      writeFileSync(
        join(ok, "SKILL.md"),
        "---\nname: ok\ndescription: ok desc\n---\n",
      );
      const drift = join(root, "skills", "drift");
      mkdirSync(drift);
      writeFileSync(
        join(drift, "SKILL.md"),
        "---\nname: ps-drift\ndescription: drift desc\n---\n",
      );
      const broken = join(root, "skills", "broken");
      mkdirSync(broken);
      writeFileSync(join(broken, "SKILL.md"), "# no frontmatter\n");

      const result = validateStack(root);
      expect(result.scanned).toBe(3);
      expect(result.pass.length).toBe(1);
      expect(result.warn.length).toBe(1);
      expect(result.fail.length).toBe(1);
    } finally {
      rmSync(root, { recursive: true });
    }
  });
});

describe("isStackPath", () => {
  test("true if skills/ exists", () => {
    const root = setupStack();
    try {
      expect(isStackPath(root)).toBe(true);
    } finally {
      rmSync(root, { recursive: true });
    }
  });

  test("true if plugins/ exists", () => {
    const root = mkdtempSync(join(tmpdir(), "pdctx-plugins-only-"));
    try {
      mkdirSync(join(root, "plugins"));
      expect(isStackPath(root)).toBe(true);
    } finally {
      rmSync(root, { recursive: true });
    }
  });

  test("false if neither skills/ nor plugins/", () => {
    const root = mkdtempSync(join(tmpdir(), "pdctx-not-stack-"));
    try {
      expect(isStackPath(root)).toBe(false);
    } finally {
      rmSync(root, { recursive: true });
    }
  });
});
