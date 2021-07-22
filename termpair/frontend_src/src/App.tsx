/* eslint-disable react-hooks/exhaustive-deps */
import React, { useEffect, useState, useLayoutEffect } from "react";
import "xterm/css/xterm.css";
import logo from "./logo.png"; // logomakr.com/4N54oK
// import { CogIcon } from "@heroicons/react/solid";
import { DuplicateIcon } from "@heroicons/react/solid";
import { Terminal as Xterm, IDisposable } from "xterm";
import moment from "moment";
import { getSecretKey, decrypt, encrypt } from "./encryption";
import { ToastContainer, toast } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import { atom, useRecoilState } from "recoil";
import { debounce } from "debounce";
import { requestTerminalDimensions, sendCommandToTerminal } from "./events";
import { CopyToClipboard } from "react-copy-to-clipboard";

const githubLogo = (
  <svg width="24" height="24" fill="currentColor" className="text-white mr-3 ">
    <path
      fillRule="evenodd"
      clipRule="evenodd"
      d="M12 2C6.477 2 2 6.463 2 11.97c0 4.404 2.865 8.14 6.839 9.458.5.092.682-.216.682-.48 0-.236-.008-.864-.013-1.695-2.782.602-3.369-1.337-3.369-1.337-.454-1.151-1.11-1.458-1.11-1.458-.908-.618.069-.606.069-.606 1.003.07 1.531 1.027 1.531 1.027.892 1.524 2.341 1.084 2.91.828.092-.643.35-1.083.636-1.332-2.22-.251-4.555-1.107-4.555-4.927 0-1.088.39-1.979 1.029-2.675-.103-.252-.446-1.266.098-2.638 0 0 .84-.268 2.75 1.022A9.606 9.606 0 0112 6.82c.85.004 1.705.114 2.504.336 1.909-1.29 2.747-1.022 2.747-1.022.546 1.372.202 2.386.1 2.638.64.696 1.028 1.587 1.028 2.675 0 3.83-2.339 4.673-4.566 4.92.359.307.678.915.678 1.846 0 1.332-.012 2.407-.012 2.734 0 .267.18.577.688.48C19.137 20.107 22 16.373 22 11.969 22 6.463 17.522 2 12 2z"
    ></path>
  </svg>
);

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
      <a href="https://github.com/cs01/termpair">{githubLogo}</a>
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
          <a href="https://chadsmith.dev">chadsmith.dev</a> |{" "}
          <a href="https://github.com/cs01">GitHub</a>
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

const host = `${window.location.protocol}//${window.location.hostname}${window.location.pathname}`;
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
const termpairShareCommand = `termpair share --host "${host}" --port ${port}`;
const pipxTermpairShareCommand = `pipx run ${termpairShareCommand}`;

function CopyCommand(props: { command: string }) {
  const [clicked, setClicked] = useState(false);
  const [hovering, setHovering] = useState(false);
  return (
    <div className="flex">
      <code
        className={`${
          hovering || clicked ? "bg-yellow-200" : "bg-gray-200"
        } text-black px-2 py-1 m-2`}
      >
        {props.command}
      </code>
      <CopyToClipboard text={props.command}>
        <button
          className="px-2"
          title="Copy command to clipboard"
          onMouseEnter={() => setHovering(true)}
          onMouseLeave={() => setHovering(false)}
          onClick={() => {
            setClicked(true);
            setTimeout(() => setClicked(false), 1500);
          }}
        >
          <DuplicateIcon className="h-6 w-6 text-white" />
        </button>
      </CopyToClipboard>
      <span className="py-1 m-2">{clicked ? "Copied!" : ""}</span>
    </div>
  );
}

function LandingPageContent() {
  return (
    <div className="text-gray-300">
      <div className="py-2">
        <div className="text-2xl ">Welcome to TermPair!</div>
        Easily share terminals with end-to-end encryption 🔒. Terminal data is
        always encrypted before being routed through the server.{" "}
        <a href="https://github.com/cs01/termpair">Learn more.</a>
      </div>
      <div className="py-2">
        <div className="text-xl  py-2">Quick Start</div>
        <div>
          If you have TermPair installed, share a terminal with this host:
        </div>
        <CopyCommand command={termpairShareCommand} />
        <div>Or if you have pipx, you can run TermPair via pipx:</div>
        <CopyCommand command={pipxTermpairShareCommand} />
      </div>
      <div className="py-2">
        <div className="text-xl  py-2">Install TermPair</div>
        <div>Install with pipx</div>
        <CopyCommand command="pipx install termpair" />
        <div>Or install with pip</div>
        <CopyCommand command="pip install termpair --user" />
      </div>
      <div className="py-2">
        <div className="text-xl  py-2">TermPair Demo</div>
        <div>
          <img
            alt="Screencast of TermPair"
            src="https://raw.githubusercontent.com/cs01/termpair/master/termpair_browser.gif"
          />
        </div>
      </div>
    </div>
  );
}
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
      break;
    case "Invalid encryption key":
      xterm.writeln(
        redXtermText(
          `Did not receive a valid secret encryption key. Confirm the full and correct url was entered.`
        )
      );
      xterm.writeln("");
      break;

    case "Browser is not running in a secure context":
      xterm.writeln(
        redXtermText(
          "Fatal Error: TermPair only works on secure connections. Ensure url starts with https. " +
            "See https://developer.mozilla.org/en-US/docs/Web/Security/Secure_Contexts and `termpair serve --help` for more information."
        )
      );
      xterm.writeln("");
      break;

    case "Connecting...":
      break;

    case "Connection Error":
      xterm.writeln(
        redXtermText(
          "An error occurred in the websocket connection to the server. Connection has been closed."
        )
      );
      break;

    case "No Terminal provided":
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
  const [xtermWasOpened, setXtermWasOpened] = useState(false);
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
    if (xtermWasOpened) {
      return;
    }
    const el = document.getElementById("terminal");
    if (!el) {
      return;
    }
    xterm.open(el);
    xterm.writeln(`Welcome to TermPair! https://github.com/cs01/termpair`);
    xterm.writeln("");
    setXtermWasOpened(true);
  }, [status]);

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
      webSocket.addEventListener("open", async (event) => {
        setStatus("Connected");
        webSocket.send(requestTerminalDimensions());

        /**
         * Process user input when user types in terminal
         */
        onDataDispose = xterm.onData(async (data: any) => {
          try {
            if (terminalServerData.allow_browser_control === false) {
              toastStatus(cannotTypeMsg);
              return;
            }
            webSocket.send(
              await sendCommandToTerminal(secretEncryptionKey, data)
            );
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
        } else if (data.event === "error") {
          console.error(data);
        } else {
          console.error("unknown event type", data);
        }
      });
    }
    setupWebsocketConnection();
  }, [terminalServerData, status]);

  const content = (
    <div className="p-5 text-white flex-grow">
      {[null, "No Terminal provided"].indexOf(status) > -1 ? (
        <LandingPageContent />
      ) : (
        <div
          id="terminal"
          className={` p-3 bg-black flex-grow text-gray-400`}
        ></div>
      )}
    </div>
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

// const instructions = [
//   "To broadcast a terminal, run",
//   "",
//   `    ${pipxTermpairShareCommand}`,
//   "",
//   "Then open or share the url printed to the terminal.",
//   "",
//   "To install pipx, see https://pipxproject.github.io/pipx/",
//   "All terminal data is end-to-end encrypted 🔒.",
//   "The termpair server and third parties can't read transmitted data.",
// ];

// function writeInstructionsToXterm(xterm: Xterm) {
//   instructions.forEach((line) => xterm.writeln(line));
// }

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
