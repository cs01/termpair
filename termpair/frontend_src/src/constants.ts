import { Terminal as Xterm } from "xterm";
// this must match constants.py
export const TERMPAIR_VERSION = "0.3.1.1";

export const defaultTermpairServer = new URL(
  `${window.location.protocol}//${window.location.hostname}:${window.location.port}${window.location.pathname}`
);

export const defaultTerminalId = new URLSearchParams(
  window.location.search
).get("terminal_id");

export const defaultBootstrapb64Key = window.location.hash.substring(
  1, // skip the '#' symbol
  window.location.hash.length - 1
);

export const cannotTypeMsg =
  "Terminal was shared in read only mode. Unable to send data to terminal's input.";

export const host = `${window.location.protocol}//${window.location.hostname}${window.location.pathname}`;
let _port = window.location.port;
if (!window.location.port) {
  if (window.location.protocol === "https:") {
    _port = "443";
  } else {
    _port = "80";
  }
}
export const port = _port;
export const termpairShareCommand = `termpair share --host "${host}" --port ${_port}`;
export const pipxTermpairShareCommand = `pipx run ${termpairShareCommand}`;

export const xterm = new Xterm({
  cursorBlink: true,
  macOptionIsMeta: true,
  scrollback: 1000,
});

export const localStorageKeys = {
  bootstrapAesKeyB64: "termpairBase64BootstrapKey",
  terminalId: "termpairTerminalId",
  host: "termpairCustomHost",
};
