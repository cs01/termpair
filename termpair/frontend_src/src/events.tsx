import { aesEncrypt } from "./encryption";

function getSalt(): string {
  return window.crypto.getRandomValues(new Uint8Array(12)).toString();
}

export function requestTerminalDimensions() {
  return JSON.stringify({ event: "request_terminal_dimensions" });
}
export async function newBrowserConnected(): Promise<string> {
  return JSON.stringify({
    event: "new_browser_connected",
    payload: {},
  });
}

export async function sendCommandToTerminal(
  secretEncryptionKey: CryptoKey,
  data: string,
  messageCount: number
) {
  return JSON.stringify({
    event: "command",
    payload: await aesEncrypt(
      secretEncryptionKey,
      JSON.stringify({ data, salt: getSalt() }),
      messageCount
    ),
  });
}

export function requestKeyRotation() {
  return JSON.stringify({
    event: "request_key_rotation",
  });
}
