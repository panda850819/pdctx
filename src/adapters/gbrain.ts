import { spawn } from "node:child_process";
import type {
  BridgeAdapter,
  BridgeHealth,
  BridgeQueryInput,
  BridgeQueryResult,
} from "./types.ts";

export interface GbrainAdapterOptions {
  binary?: string;
}

export class FirewallError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FirewallError";
  }
}

export interface GbrainQueryContext {
  gbrain?: {
    allow?: string[];
    forbid?: string[];
    write_mode?: "read-only" | "read-write" | "deny";
  };
}

export function buildGbrainArgs(input: BridgeQueryInput, ctx: GbrainQueryContext): string[] {
  const allow = ctx.gbrain?.allow ?? [];
  if (allow.length === 0) {
    throw new FirewallError(
      `gbrain query blocked: context has no allowed sources (allow = [])`,
    );
  }
  const slugPrefixArgs = allow.flatMap((s) => ["--include-slug-prefixes", `${s}/`]);
  return ["search", input.text, ...slugPrefixArgs];
}

export class GbrainAdapter implements BridgeAdapter {
  readonly name = "gbrain";
  private readonly binary: string;

  constructor(options: GbrainAdapterOptions = {}) {
    this.binary = options.binary ?? "gbrain";
  }

  query(input: BridgeQueryInput, ctx?: GbrainQueryContext): Promise<BridgeQueryResult> {
    let args: string[];
    try {
      args = buildGbrainArgs(input, ctx ?? {});
    } catch (err) {
      if (err instanceof FirewallError) {
        console.error(`[pdctx] gbrain firewall: ${err.message}`);
        return Promise.resolve({ exitCode: 1 });
      }
      throw err;
    }

    return new Promise((resolve) => {
      const child = spawn(this.binary, args, { stdio: "inherit" });
      let settled = false;
      child.on("exit", (code) => {
        if (settled) return;
        settled = true;
        resolve({ exitCode: code ?? 0 });
      });
      child.on("error", (err) => {
        if (settled) return;
        settled = true;
        console.error(`[pdctx] ${this.binary} spawn failed: ${err.message}`);
        resolve({ exitCode: 1 });
      });
    });
  }

  health(): Promise<BridgeHealth> {
    return new Promise((resolve) => {
      const child = spawn(this.binary, ["doctor", "--fast", "--json"], {
        stdio: ["ignore", "pipe", "ignore"],
      });
      let stdout = "";
      let settled = false;
      child.stdout?.on("data", (chunk) => (stdout += chunk.toString()));
      child.on("exit", (code) => {
        if (settled) return;
        settled = true;
        if (code === 0) {
          let detail = stdout.trim() || `${this.binary} responsive`;
          // Parse JSON status if available
          try {
            const parsed = JSON.parse(stdout.trim());
            if (parsed.status) detail = `${this.binary} ${parsed.status}`;
          } catch {
            // non-JSON output is fine
          }
          resolve({ status: "ok", detail });
        } else {
          resolve({ status: "warn", detail: `${this.binary} exited ${code}` });
        }
      });
      child.on("error", (err) => {
        if (settled) return;
        settled = true;
        resolve({ status: "fail", detail: `${this.binary} not found: ${err.message}` });
      });
    });
  }

  // Write operations are blocked in v0. Stub throws to surface incorrect usage.
  write(_slug: string, _content: string, _ctx?: GbrainQueryContext): Promise<void> {
    return Promise.reject(
      new FirewallError(
        "gbrain write is not implemented in v0. Write mode enforcement is a Phase 2 feature.",
      ),
    );
  }
}
