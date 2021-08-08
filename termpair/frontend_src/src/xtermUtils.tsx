import { toast } from "react-toastify";
import { Terminal as Xterm } from "xterm";
import { cannotTypeMsg } from "./constants";
import { isIvExhausted } from "./encryption";
import { sendCommandToTerminal, requestKeyRotation } from "./events";
import { AesKeysRef, TerminalServerData } from "./types";
import { toastStatus } from "./utils";
/**
 * The API to xterm.attachCustomKeyEventHandler is hardcoded. This function
 * provides a closure so that other variables can be used inside it.
 *
 * https://github.com/xtermjs/xterm.js/blob/70babeacb62fe05264d64324ca1f4436997efa1b/typings/xterm.d.ts#L538-L547
 *
 * @param {*} terminal - xterm object
 * @param {*} canType  - is user allowed to type (this is also enforced on the server)
 * @param {*} sendInputToTerminal - function to encode and send input over the websocket
 * @returns nothing
 */
export function getCustomKeyEventHandler(
  terminal: Xterm,
  canType: boolean | void,
  sendInputToTerminal: (input: string) => void
) {
  /**
   * Custom key event handler which is run before keys are
   * processed, giving consumers of xterm.js ultimate control as to what keys
   * should be processed by the terminal and what keys should not.
   * @param customKeyEventHandler The custom KeyboardEvent handler to attach.
   * This is a function that takes a KeyboardEvent, allowing consumers to stop
   * propagation and/or prevent the default action. The function returns
   * whether the event should be processed by xterm.js.
   */
  function customKeyEventHandler(e: KeyboardEvent): boolean {
    if (e.type !== "keydown") {
      return true;
    }
    if (e.ctrlKey && e.shiftKey) {
      const key = e.key.toLowerCase();
      if (key === "v") {
        if (!canType) {
          toastStatus(cannotTypeMsg);
          return false;
        }
        navigator.clipboard.readText().then((toPaste) => {
          sendInputToTerminal(toPaste);
        });
        return false;
      } else if (key === "c" || key === "x") {
        // 'x' is used as an alternate to 'c' because ctrl+c is taken
        // by the terminal (SIGINT) and ctrl+shift+c is taken by the browser
        // (open devtools).
        // I'm not aware of ctrl+shift+x being used by anything in the terminal
        // or browser
        const toCopy = terminal.getSelection();
        navigator.clipboard.writeText(toCopy);
        terminal.focus();
        return false;
      }
    }
    return true;
  }

  return customKeyEventHandler;
}

export function redXtermText(text: string): string {
  return "\x1b[1;31m" + text + "\x1b[0m";
}

export function getOnDataHandler(
  ws: WebSocket,
  terminalServerData: TerminalServerData,
  aesKeys: React.MutableRefObject<AesKeysRef>
) {
  return async (newInput: any) => {
    try {
      if (terminalServerData.allow_browser_control === false) {
        toastStatus(cannotTypeMsg);
        return;
      }
      if (
        aesKeys.current.browser === null ||
        aesKeys.current.ivCount === null ||
        aesKeys.current.maxIvCount === null
      ) {
        toast.dark(
          `Cannot input because it cannot be encrypted. Encryption keys are missing.`
        );
        return;
      }
      ws.send(
        await sendCommandToTerminal(
          aesKeys.current.browser,
          newInput,
          aesKeys.current.ivCount++
        )
      );
      if (isIvExhausted(aesKeys.current.ivCount, aesKeys.current.maxIvCount)) {
        ws.send(requestKeyRotation());
        aesKeys.current.maxIvCount += 1000;
      }
    } catch (e) {
      toast.dark(`Failed to send data to terminal ${e}`);
    }
  };
}
