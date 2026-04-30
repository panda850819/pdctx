export type BridgeQueryMode = "search" | "vsearch" | "query";

export interface BridgeQueryInput {
  mode: BridgeQueryMode;
  text: string;
  collection?: string;
  limit?: string;
}

export interface BridgeQueryResult {
  exitCode: number;
}

export interface BridgeHealth {
  status: "ok" | "warn" | "fail";
  detail: string;
}

export interface BridgeAdapter {
  readonly name: string;
  query(input: BridgeQueryInput): Promise<BridgeQueryResult>;
  health(): Promise<BridgeHealth>;
}
