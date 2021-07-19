/* eslint-disable react-hooks/exhaustive-deps */
import React, { useEffect, useState, useLayoutEffect } from "react";
import "xterm/css/xterm.css";
import logo from "./logo.png"; // logomakr.com/4N54oK
// import { CogIcon } from "@heroicons/react/solid";
import { Terminal as Xterm, IDisposable } from "xterm";
import moment from "moment";
import { getSecretKey, decrypt, encrypt } from "./encryption";
import { ToastContainer, toast } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import { atom, useRecoilState } from "recoil";
import { debounce } from "debounce";

const showSettings = atom({
  key: "showSettings",
  default: false,
});

function Settings(props: any) {
  const [showSetting, setShowSettings] = useRecoilState(showSettings);
  if (!showSetting) {
    return null;
  }
  return (
    <div
      className="w-full h-full bg-gray-900 absolute bg-opacity-90  text-black"
      style={{ zIndex: 2000 }}
    >
      <div className="w-11/12 h-5/6 m-10 p-5 bg-gray-400 flex items-center flex-col">
        <div className="text-xl mb-10">TermPair Settings</div>
        <div className="flex-grow">Body</div>
        <div>
          <button
            className="bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-full"
            onClick={() => setShowSettings(false)}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

function TopBar(props: any) {
  // const [showSetting, setShowSettings] = useRecoilState(showSettings);

  return (
    <div className="flex bg-black h-10 items-center justify-between">
      <div className="h-full">
        <a href={window.location.pathname}>
          <img className="h-full" src={logo} alt="logo" />
        </a>
      </div>
      {/* <div className="text-white m-5">
        <div className="my-auto">
          <button
            className="my-auto"
            onClick={() => setShowSettings(!showSetting)}
          >
            <CogIcon className="h-6 w-6 text-white" />
          </button>
        </div>
      </div> */}
    </div>
  );
}

function BottomBar(props: {
  status: Status;
  terminalData: Nullable<TerminalServerData>;
  terminalId: Nullable<string>;
  terminalSize: TerminalSize;
  numClients: number;
}) {
  const connected = props.status === "Connected";
  const hasTerminalId = props.terminalId != null;
  const status = hasTerminalId ? <div>{props.status}</div> : null;

  const canType = connected ? (
    <div
      title="Whether you are allowed to send data to the terminal's input.
    This setting is controlled when initially sharing the terminal, and cannot be changed
    after sharing has begun."
    >
      {props.terminalData?.allow_browser_control && props.status === "Connected"
        ? "can type"
        : "cannot type"}
    </div>
  ) : null;

  const connectedClients = connected ? (
    <div title="Number of other browsers connected to this terminal">
      {props.numClients ? props.numClients : "0"} Connected Client(s)
    </div>
  ) : null;

  const startTime = connected ? (
    <div>
      Started at{" "}
      {moment(props.terminalData?.broadcast_start_time_iso).format(
        "h:mm a on MMM Do, YYYY"
      )}
    </div>
  ) : null;

  const terminalDimensions = connected ? (
    <span title="Dimensions of terminal, rows x cols">
      {props.terminalSize.rows}x{props.terminalSize.cols}
    </span>
  ) : null;

  return (
    <>
      <div
        className={`flex ${
          connected ? "bg-green-900" : "bg-red-900"
        }   justify-evenly text-gray-300`}
      >
        {status}
        {terminalDimensions}
        {canType}
        {connectedClients}
        {startTime}
      </div>
      <div className="flex bg-black  justify-evenly text-gray-300">
        <div>
          <a href="https://chadsmith.dev">chadsmith.dev</a>
        </div>
        <div>
          <a href="https://github.com/cs01"> GitHub</a>
        </div>
      </div>
    </>
  );
}

class ErrorBoundary extends React.Component<any, any> {
  constructor(props: any) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: any) {
    // Update state so the next render will show the fallback UI.
    return { hasError: true };
  }

  componentDidCatch(error: any, errorInfo: any) {
    // You can also log the error to an error reporting service
    // logErrorToMyService(error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      // You can render any custom fallback UI
      return <h1>Something went wrong.</h1>;
    }

    return this.props.children;
  }
}

const cannotTypeMsg =
  "Terminal was shared in read only mode. Unable to send data to terminal's input.";

type Status =
  | null
  | "Connecting..."
  | "Connected"
  | "Disconnected"
  | "Connection Error"
  | "Terminal ID is invalid"
  | "Browser is not running in a secure context"
  | "No Terminal provided"
  | "Invalid encryption key";

type TerminalServerData = {
  terminal_id: string;
  allow_browser_control: boolean;
  num_clients: number;
  broadcast_start_time_iso: string;
};

type TerminalSize = {
  rows: number;
  cols: number;
};

const toastStatus = debounce((status: any) => {
  toast.dark(status);
}, 500);

function redXtermText(text: string): string {
  return "\x1b[1;31m" + text + "\x1b[0m";
}

function handleStatusChange(
  xterm: Xterm,
  terminalId: Nullable<string>,
  status: Status,
  prevStatus: Status
): void {
  switch (status) {
    case null:
      break;
    case "Connected":
      xterm.writeln("Connection established with end-to-end encryption 🔒.");
      xterm.writeln(
        "The termpair server and third parties can't read transmitted data."
      );
      xterm.writeln("");
      xterm.writeln(
        "You can copy text with ctrl+shift+c or ctrl+shift+x, and paste with ctrl+shift+v."
      );
      xterm.writeln("");
      break;
    case "Disconnected":
      if (prevStatus === "Connected") {
        xterm.writeln(redXtermText("Terminal session has ended"));
        xterm.writeln("");
        writeInstructions(xterm);
      }
      break;
    case "Terminal ID is invalid":
      xterm.writeln(
        redXtermText(
          `An invalid Terminal ID (${terminalId}) was provided. ` +
            `Check that the session is still being broadcast and that the ID is entered correctly.`
        )
      );
      xterm.writeln("");
      writeInstructions(xterm);
      break;
    case "Invalid encryption key":
      xterm.writeln(
        redXtermText(
          `Did not receive a valid secret encryption key. Confirm the full and correct url was entered.`
        )
      );
      xterm.writeln("");
      writeInstructions(xterm);
      break;

    case "Browser is not running in a secure context":
      xterm.writeln(
        redXtermText(
          "Fatal Error: TermPair only works on secure connections. Ensure url starts with https. " +
            "See https://developer.mozilla.org/en-US/docs/Web/Security/Secure_Contexts and `termpair serve --help` for more information."
        )
      );
      xterm.writeln("");
      writeInstructions(xterm);
      break;

    case "Connecting...":
      break;

    case "Connection Error":
      xterm.writeln(
        redXtermText(
          "An error occurred in the websocket connection to the server. Connection has been closed."
        )
      );
      writeInstructions(xterm);
      break;

    case "No Terminal provided":
      writeInstructions(xterm);
      break;

    default:
      ((_: "Unhandled switch case"): never => {
        throw Error;
      })(status);
  }
  return status as never;
}

function App() {
  const [terminalServerData, setTerminalServerData] =
    useState<Nullable<TerminalServerData>>(null);
  const [numClients, setNumClients] = useState(0);
  const [terminalSize, setTerminalSize] = useState<TerminalSize>({
    rows: 20,
    cols: 81,
  });
  const [resizeTimeout, setResizeTimeout] =
    useState<Nullable<NodeJS.Timeout>>(null);
  const [status, setStatus] = useState<Status>(null);
  const [prevStatus, setPrevStatus] = useState<Status>(null);

  const [xterm] = useState(
    new Xterm({
      cursorBlink: true,
      macOptionIsMeta: true,
      scrollback: 1000,
    })
  );
  const [terminalId] = useState(
    new URLSearchParams(window.location.search).get("terminal_id")
  );

  const [secretEncryptionKey, setSecretEncryptionKey] =
    useState<Nullable<CryptoKey>>(null);

  useLayoutEffect(() => {
    const el = document.getElementById("terminal");
    if (!el) {
      console.error("no terminal element, aborting");
      return;
    }
    xterm.open(el);
    xterm.writeln(`Welcome to TermPair! https://github.com/cs01/termpair`);
    xterm.writeln("");
  }, []);

  useEffect(() => {
    // console.log(`Terminal connection status: ${status}`);
    const noToast = ["No Terminal provided"];
    if (status && noToast.indexOf(status) === -1) {
      // @ts-ignore
      toastStatus(<div>Terminal status: {status}</div>);
    }
    handleStatusChange(xterm, terminalId, status, prevStatus);
    setPrevStatus(status);
  }, [status]);

  useEffect(() => {
    async function getTerminalData() {
      if (!terminalId) {
        setTerminalServerData(null);
        setStatus("No Terminal provided");
        return;
      }
      if (!window.isSecureContext) {
        setStatus("Browser is not running in a secure context");
        return;
      }
      const secretEncryptionKey = await getSecretKey();
      setSecretEncryptionKey(secretEncryptionKey);
      if (!secretEncryptionKey) {
        setStatus("Invalid encryption key");
      }

      const response = await fetch(`terminal/${terminalId}`);
      if (response.status === 200) {
        setTerminalServerData(await response.json());
      } else {
        setStatus("Terminal ID is invalid");
        setTerminalServerData(null);
      }
    }
    getTerminalData();
  }, [terminalId]);

  useEffect(() => {
    if (resizeTimeout) {
      clearTimeout(resizeTimeout);
    }
    setResizeTimeout(
      setTimeout(() => {
        xterm.resize(terminalSize.cols, terminalSize.rows);
      }, 500)
    );
  }, [terminalSize, xterm]);

  useEffect(() => {
    function setupWebsocketConnection() {
      if (status !== null) {
        return;
      }
      if (!(terminalServerData?.terminal_id && secretEncryptionKey)) {
        return;
      }
      setStatus("Connecting...");

      const ws_protocol = window.location.protocol === "https:" ? "wss" : "ws";
      const webSocket = new WebSocket(
        `${ws_protocol}://${window.location.hostname}:${window.location.port}${window.location.pathname}connect_browser_to_terminal?terminal_id=${terminalServerData.terminal_id}`
      );

      xterm.attachCustomKeyEventHandler(
        getCustomKeyEventHandler(
          xterm,
          terminalServerData?.allow_browser_control,
          async (newInput: any) => {
            try {
              webSocket.send(await encrypt(secretEncryptionKey, newInput));
            } catch (e) {
              // TODO display in popup to user
              console.error("Failed to send data over websocket", e);
            }
          }
        )
      );
      let onDataDispose: Nullable<IDisposable>;
      webSocket.addEventListener("open", (event) => {
        setStatus("Connected");
        onDataDispose = xterm.onData(async (data: any) => {
          try {
            if (terminalServerData.allow_browser_control === false) {
              toastStatus(cannotTypeMsg);
              return;
            }
            webSocket.send(await encrypt(secretEncryptionKey, data));
          } catch (e) {
            // TODO display in popup to user
            console.error("Failed to send data over websocket", e);
          }
        });
      });
      webSocket.addEventListener("close", (event) => {
        if (onDataDispose) {
          // stop trying to send data since the connection is closed
          onDataDispose.dispose();
        }

        setStatus("Disconnected");
        setNumClients(0);
      });

      webSocket.addEventListener("error", (event) => {
        if (onDataDispose) {
          // stop trying to send data since the connection is closed
          onDataDispose.dispose();
        }

        console.error(event);
        setStatus("Connection Error");
        setNumClients(0);
      });

      webSocket.addEventListener("message", async (message: any) => {
        const data = JSON.parse(message.data);
        if (data.event === "new_output") {
          const encryptedBase64Payload = data.payload;
          const decryptedPayload = await decrypt(
            secretEncryptionKey,
            encryptedBase64Payload
          );
          xterm.write(decryptedPayload);
        } else if (data.event === "resize") {
          if (data.payload.cols && data.payload.rows) {
            setTerminalSize({
              cols: data.payload.cols,
              rows: data.payload.rows,
            });
          }
        } else if (data.event === "num_clients") {
          // @ts-ignore
          const num_clients = data.payload;
          // @ts-ignore
          setNumClients(num_clients);
        } else {
          console.error("unknown event type", data);
        }
      });
    }
    setupWebsocketConnection();
  }, [terminalServerData, status]);

  const content = (
    <div id="terminal" className="p-3 bg-black flex-grow text-gray-400"></div>
  );
  return (
    <ErrorBoundary>
      <div className="flex flex-col h-screen">
        <ToastContainer
          position="bottom-right"
          limit={3}
          autoClose={5000}
          hideProgressBar={false}
          newestOnTop={false}
          closeOnClick
          rtl={false}
          pauseOnFocusLoss={false}
          draggable
          pauseOnHover
        />
        <Settings />
        <TopBar />
        {content}
        <BottomBar
          terminalData={terminalServerData}
          status={status}
          terminalId={terminalId}
          terminalSize={terminalSize}
          numClients={numClients}
        />
      </div>
    </ErrorBoundary>
  );
}

function writeInstructions(xterm: Xterm) {
  xterm.writeln("To broadcast a terminal, run");
  const host = `${window.location.protocol}//${window.location.hostname}${window.location.pathname}`;
  xterm.writeln("");
  let port = window.location.port;
  if (!window.location.port) {
    if (window.location.protocol === "https:") {
      // @ts-expect-error ts-migrate(2322) FIXME: Type 'number' is not assignable to type 'string'.
      port = 443;
    } else {
      // @ts-expect-error ts-migrate(2322) FIXME: Type 'number' is not assignable to type 'string'.
      port = 80;
    }
  }
  xterm.writeln(`    pipx run termpair share --host "${host}" --port ${port}`);
  xterm.writeln("");
  xterm.writeln("Then open or share the url printed to the terminal.");
  xterm.writeln("");
  xterm.writeln("To install pipx, see https://pipxproject.github.io/pipx/");
  xterm.writeln("All terminal data is end-to-end encrypted 🔒.");
  xterm.writeln(
    "The termpair server and third parties can't read transmitted data."
  );
}

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
function getCustomKeyEventHandler(
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

export default App;
