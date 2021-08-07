export type AesKeysRef = {
  bootstrap: Nullable<CryptoKey>;
  browser: Nullable<CryptoKey>;
  unix: Nullable<CryptoKey>;
  ivCount: Nullable<number>;
  maxIvCount: Nullable<number>;
};

export type Status =
  | null
  | "Connecting..."
  | "Connected"
  | "Disconnected"
  | "Connection Error"
  | "Terminal ID is invalid"
  | "Browser is not running in a secure context"
  | "No Terminal provided"
  | "Failed to obtain encryption keys"
  | "Ready for websocket connection"
  | "Invalid encryption key"
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
