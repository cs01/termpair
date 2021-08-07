// Symmetric encryption with aes gcm
// https://github.com/mdn/dom-examples/blob/master/web-crypto/encrypt-decrypt/aes-gcm.js

const IV_LENGTH = 12;

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function ab2str(buf: ArrayBuffer): string {
  // @ts-ignore
  return String.fromCharCode.apply(null, new Uint8Array(buf));
}

export async function getAESKey(
  rawKeyData: Buffer,
  usages: Array<"encrypt" | "decrypt">
): Promise<CryptoKey> {
  return await window.crypto.subtle.importKey(
    "raw",
    rawKeyData,
    {
      name: "AES-GCM",
    },
    false, // extractable
    usages
  );
}

export async function getBootstrapAESKey(): Promise<Nullable<CryptoKey>> {
  try {
    const b64EncodedKey = window.location.hash.substring(
      1, // skip the '#' symbol
      window.location.hash.length - 1
    );
    if (!b64EncodedKey) {
      return null;
    }
    const keyData = Buffer.from(b64EncodedKey, "base64");
    return await getAESKey(keyData, ["decrypt"]);
  } catch (e) {
    console.error(e);
    return null;
  }
}

export async function aesDecrypt(
  secretcryptoKey: CryptoKey,
  encryptedPayload: Buffer
): Promise<Buffer> {
  // iv is prepended to encrypted payload
  const iv = encryptedPayload.subarray(0, IV_LENGTH);

  // remaining bytes are encrypted utf-8 output of terminal
  const encryptedTerminalOutput = encryptedPayload.subarray(IV_LENGTH);

  const decryptedTerminalOutput = Buffer.from(
    await window.crypto.subtle.decrypt(
      {
        name: "AES-GCM",
        iv: iv,
      },
      secretcryptoKey,
      encryptedTerminalOutput
    )
  );
  return decryptedTerminalOutput;
}

// https://stackoverflow.com/a/65227338/2893090
function ivFromInteger(ivCount: number) {
  const iv = new Uint8Array(IV_LENGTH);
  const a = [];
  a.unshift(ivCount & 255);
  // while some other byte still has data
  while (ivCount >= 256) {
    // shift 8 bits over (consume next byte)
    ivCount = ivCount >>> 8;
    // prepend current byte value to front of the array
    a.unshift(ivCount & 255);
  }
  // set the 12 byte array with the array we just
  // computed
  iv.set(a);
  return iv;
}

export async function aesEncrypt(
  browserSecretAESKey: CryptoKey,
  utf8Payload: string,
  ivCount: number
) {
  // The same iv must never be reused with a given key
  const iv = ivFromInteger(ivCount);
  const encryptedArrayBuffer = await window.crypto.subtle.encrypt(
    {
      name: "AES-GCM",
      iv: iv,
    },
    browserSecretAESKey,
    new TextEncoder().encode(utf8Payload)
  );
  // prepend unencrypted iv to encrypted payload
  const ivAndEncryptedPayload = _combineBuffers(iv, encryptedArrayBuffer);

  const base64EncryptedString = _arrayBufferToBase64(ivAndEncryptedPayload);
  return base64EncryptedString;
}

export function isIvExhausted(ivCount: number, maxIvCount: number): boolean {
  return ivCount >= maxIvCount;
}

function _combineBuffers(
  buffer1: Uint8Array,
  buffer2: ArrayBuffer
): ArrayBufferLike {
  const tmp = new Uint8Array(buffer1.byteLength + buffer2.byteLength);
  tmp.set(new Uint8Array(buffer1), 0);
  tmp.set(new Uint8Array(buffer2), buffer1.byteLength);
  return tmp.buffer;
}

function _arrayBufferToBase64(buffer: ArrayBuffer) {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    // returns a utf-16 character, considered "binary"
    binary += String.fromCharCode(bytes[i]);
  }
  // "binary to ascii"
  return window.btoa(binary);
}
