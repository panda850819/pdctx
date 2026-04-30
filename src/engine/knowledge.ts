import type { ContextDef } from "../schema/context.ts";

export interface QueryPlanInput {
  context: ContextDef | null;
  userCollection?: string;
}

export type QueryPlan =
  | { action: "allow"; collections: string[]; reason: string }
  | { action: "filter"; collections: string[]; reason: string }
  | { action: "reject"; collections: []; reason: string };

export function planQueryArgs(input: QueryPlanInput): QueryPlan {
  const { context, userCollection } = input;

  if (!context) {
    return {
      action: "allow",
      collections: userCollection ? [userCollection] : [],
      reason: "no active context — pass-through",
    };
  }

  const kn = context.knowledge;

  if (!kn) {
    return {
      action: "allow",
      collections: userCollection ? [userCollection] : [],
      reason: `context "${context.context.name}" has no [knowledge] section — pass-through`,
    };
  }

  if (userCollection) {
    if (kn.forbid.includes(userCollection)) {
      return {
        action: "reject",
        collections: [],
        reason: `collection "${userCollection}" forbidden in context "${context.context.name}"`,
      };
    }
    return {
      action: "allow",
      collections: [userCollection],
      reason: kn.allow.includes(userCollection)
        ? `collection "${userCollection}" in allow list`
        : `collection "${userCollection}" not in allow but not forbidden — pass-through`,
    };
  }

  if (kn.allow.length === 0) {
    return {
      action: "allow",
      collections: [],
      reason: `context "${context.context.name}" has empty knowledge.allow — passing through (forbid only enforced with explicit -c)`,
    };
  }

  return {
    action: "filter",
    collections: [...kn.allow],
    reason: `auto-expanding to ${kn.allow.length} allowed collection(s) from context "${context.context.name}"`,
  };
}
