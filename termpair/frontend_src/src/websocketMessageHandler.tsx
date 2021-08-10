import { toast } from "react-toastify";
import { xterm } from "./constants";
import { aesDecrypt, getAESKey } from "./encryption";
import { AesKeysRef, Status, TerminalSize } from "./types";

// This should be kept in sync with the Python client
export type TermPairEvent =
  | "new_output"
  | "resize"
  | "num_clients"
  | "aes_keys"
  | "error"
  | "aes_key_rotation";

// TODO use something like https://www.npmjs.com/package/yup to
// validate the json at runtime
export const handlers = {
  new_output: async function (
    aesKeys: React.MutableRefObject<AesKeysRef>,
    data: any
  ) {
    if (!aesKeys.current.unix) {
      console.error(
        "Missing AES CryptoKey for unix terminal. Cannot decrypt message."
      );
      return;
    }
    const decryptedJson = await aesDecrypt(
      aesKeys.current.unix,
      Buffer.from(data.payload, "base64")
    );
    const decryptedPayload = JSON.parse(decryptedJson.toString());
    const pty_output = Buffer.from(decryptedPayload.pty_output, "base64");
    xterm.write(pty_output);
  },
  resize: function (
    data: any,
    setTerminalSize: React.Dispatch<React.SetStateAction<TerminalSize>>
  ) {
    if (data.payload.cols && data.payload.rows) {
      const cols = data.payload.cols;
      const rows = data.payload.rows;
      setTerminalSize({
        cols,
        rows,
      });
      xterm.resize(cols, rows);
    }
  },
  num_clients: function (
    setNumClients: React.Dispatch<React.SetStateAction<number>>,
    data: any
  ) {
    const num_clients = data.payload;
    setNumClients(num_clients);
  },
  aes_keys: async function (
    aesKeys: React.MutableRefObject<AesKeysRef>,
    bootstrapAesKey: CryptoKey,
    data: any,
    changeStatus: (newStatus: Status) => void
  ) {
    try {
      const unixAesKeyData = await aesDecrypt(
        bootstrapAesKey,
        Buffer.from(data.payload.b64_bootstrap_unix_aes_key, "base64")
      );
      aesKeys.current.unix = await getAESKey(unixAesKeyData, ["decrypt"]);

      const browserAesKeyData = await aesDecrypt(
        bootstrapAesKey,
        Buffer.from(data.payload.b64_bootstrap_browser_aes_key, "base64")
      );
      aesKeys.current.browser = await getAESKey(browserAesKeyData, ["encrypt"]);
      if (data.payload.iv_count == null || data.payload.max_iv_count == null) {
        console.error("missing required iv parameters");
        throw Error("missing required iv parameters");
      }
      const startIvCount = (aesKeys.current.ivCount = parseInt(
        data.payload.iv_count,
        10
      ));

      const maxIvCount = (aesKeys.current.maxIvCount = parseInt(
        data.payload.max_iv_count,
        10
      ));
      if (maxIvCount < startIvCount) {
        console.error(
          `Initialized IV counter is below max value ${startIvCount} vs ${maxIvCount}`
        );
        aesKeys.current = {
          ...aesKeys.current,
          browser: null,
          maxIvCount: null,
          ivCount: null,
          unix: null,
        };
        throw Error;
      }
    } catch (e) {
      if (
        aesKeys.current.browser == null ||
        aesKeys.current.unix == null ||
        aesKeys.current.ivCount == null ||
        aesKeys.current.maxIvCount == null
      ) {
        console.error(e);
        console.error(data);
        changeStatus("Failed to obtain encryption keys");
        return;
      }
    }
  },
  aes_key_rotation: async function (
    aesKeys: React.MutableRefObject<AesKeysRef>,
    data: any
  ) {
    if (!aesKeys.current.unix) {
      console.error("Cannot decrypt new AES keys");
      return;
    }
    try {
      const newUnixAesKeyData = await aesDecrypt(
        aesKeys.current.unix,
        data.payload.b64_aes_secret_unix_key
      );
      const newBrowserAesKeyData = await aesDecrypt(
        aesKeys.current.unix,
        Buffer.from(data.payload.b64_aes_secret_browser_key, "base64")
      );
      aesKeys.current.browser = await getAESKey(newBrowserAesKeyData, [
        "encrypt",
      ]);
      aesKeys.current.unix = await getAESKey(newUnixAesKeyData, ["decrypt"]);
      // toast.dark("AES keys have been rotated");
    } catch (e) {
      console.error(e);
      toast.dark(`AES key rotation failed: ${e}`);
    }
  },
  error: function (data: any) {
    toast.dark(`Error: ${data.payload}`);
    console.error(data);
  },
  default: function (data: any) {
    toast.dark(`Unknown event received: ${data.event}`);
    console.error("unknown event type", data);
  },
};
