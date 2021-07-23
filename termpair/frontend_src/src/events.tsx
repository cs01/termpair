import { encrypt } from "./encryption";

export function requestTerminalDimensions() {
  return JSON.stringify({ event: "request_terminal_dimensions" });
}

export async function sendCommandToTerminal(
  secretEncryptionKey: CryptoKey,
  data: string
) {
  return JSON.stringify({
    event: "command",
    payload: await encrypt(secretEncryptionKey, data),
  });
}
