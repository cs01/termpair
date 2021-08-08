export type AesKeysRef = {
  browser: Nullable<CryptoKey>;
  unix: Nullable<CryptoKey>;
  ivCount: Nullable<number>;
  maxIvCount: Nullable<number>;
};

export type Status =
  | null
  | "Connecting..."
  | "Connection Established"
  | "Disconnected"
  | "Connection Error"
  | "Terminal ID is invalid"
  | "Browser is not running in a secure context"
  | "Failed to obtain encryption keys"
  | "Failed to fetch terminal data";

export type TerminalSize = {
  rows: number;
  cols: number;
};

export type TerminalServerData = {
  terminal_id: string;
  allow_browser_control: boolean;
  num_clients: number;
  broadcast_start_time_iso: string;
};
