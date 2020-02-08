// Symmetric encryption with aes gcm
// https://github.com/mdn/dom-examples/blob/master/web-crypto/encrypt-decrypt/aes-gcm.js

const IV_LENGTH = 12;

export async function getSecretKey() {
  try {
    const b64EncodedKey = window.location.hash.substring(
      1, // skip the '#' symbol
      window.location.hash.length - 1
    );
    const keyData = Buffer.from(b64EncodedKey, "base64");
    return await window.crypto.subtle.importKey(
      "raw",
      keyData,
      {
        name: "AES-GCM"
      },
      false, // extractable
      ["encrypt", "decrypt"]
    );
  } catch (e) {
    console.error(e);
    return null;
  }
}

export async function decrypt(secretKey, encryptedPayloadB64) {
  // decode base64 data to unencrypted iv and encrypted data
  const ivAndPayload = Buffer.from(encryptedPayloadB64, "base64");

  // iv is prepended to encrypted payload
  const iv = ivAndPayload.subarray(0, IV_LENGTH);

  // remaining bytes are encrypted utf-8 output of terminal
  const encryptedTerminalOutput = ivAndPayload.subarray(IV_LENGTH);

  const decryptedTerminalOutput = Buffer.from(
    await window.crypto.subtle.decrypt(
      {
        name: "AES-GCM",
        iv: iv
      },
      secretKey,
      encryptedTerminalOutput
    )
  ).toString("utf-8");
  return decryptedTerminalOutput;
}

export async function encrypt(secretKey, utf8Payload) {
  // The same iv must never be reused with a given key
  const iv = window.crypto.getRandomValues(new Uint8Array(IV_LENGTH));
  const encryptedArrayBuffer = await window.crypto.subtle.encrypt(
    {
      name: "AES-GCM",
      iv: iv
    },
    secretKey,
    new TextEncoder().encode(utf8Payload)
  );
  // prepend unencrypted iv to encrypted payload
  const ivAndEncryptedPayload = _combineBuffers(iv, encryptedArrayBuffer);

  // send as ascii
  // TODO send as binary
  const base64EncryptedString = _arrayBufferToBase64(ivAndEncryptedPayload);
  return base64EncryptedString;
}

function _combineBuffers(buffer1, buffer2) {
  const tmp = new Uint8Array(buffer1.byteLength + buffer2.byteLength);
  tmp.set(new Uint8Array(buffer1), 0);
  tmp.set(new Uint8Array(buffer2), buffer1.byteLength);
  return tmp.buffer;
}

function _arrayBufferToBase64(buffer) {
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
