import { spawn } from "node:child_process";
import type {
  BridgeAdapter,
  BridgeHealth,
  BridgeQueryInput,
  BridgeQueryResult,
} from "./types.ts";

export interface QmdAdapterOptions {
  binary?: string;
}

export function buildQmdArgs(input: BridgeQueryInput): string[] {
  const args: string[] = [input.mode, input.text];
  if (input.collection) args.push("-c", input.collection);
  if (input.limit) args.push("-n", input.limit);
  return args;
}

export class QmdBridgeAdapter implements BridgeAdapter {
  readonly name = "qmd";
  private readonly binary: string;

  constructor(options: QmdAdapterOptions = {}) {
    this.binary = options.binary ?? "qmd";
  }

  query(input: BridgeQueryInput): Promise<BridgeQueryResult> {
    return new Promise((resolve) => {
      const args = buildQmdArgs(input);
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
      const child = spawn(this.binary, ["--version"], { stdio: ["ignore", "pipe", "ignore"] });
      let stdout = "";
      let settled = false;
      child.stdout?.on("data", (chunk) => (stdout += chunk.toString()));
      child.on("exit", (code) => {
        if (settled) return;
        settled = true;
        if (code === 0) {
          resolve({ status: "ok", detail: stdout.trim() || `${this.binary} responsive` });
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
}
