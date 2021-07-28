import {
  aesEncrypt,
  exportCryptoKey as getPEMFromPublicKey,
} from "./encryption";

export function requestTerminalDimensions() {
  return JSON.stringify({ event: "request_terminal_dimensions" });
}
export async function newBrowserConnected(
  publicKey: CryptoKey
): Promise<string> {
  return JSON.stringify({
    event: "new_browser_connected",
    payload: {
      browser_public_key_pem: await getPEMFromPublicKey(publicKey),
    },
  });
}

export async function sendCommandToTerminal(
  secretEncryptionKey: CryptoKey,
  data: string,
  messageCount: number
) {
  return JSON.stringify({
    event: "command",
    payload: await aesEncrypt(secretEncryptionKey, data, messageCount),
  });
}

export function requestKeyRotation() {
  return JSON.stringify({
    event: "request_key_rotation",
  });
}
