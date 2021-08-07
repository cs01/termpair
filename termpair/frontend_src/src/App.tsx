import React, { useEffect, useState, useLayoutEffect, useRef } from "react";
import "xterm/css/xterm.css";
import { Terminal as Xterm, IDisposable } from "xterm";
import moment from "moment";
import {
  aesDecrypt,
  getAESKey,
  getBootstrapAESKey,
  isIvExhausted,
} from "./encryption";
import { ToastContainer, toast } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import { debounce } from "debounce";
import {
  newBrowserConnected,
  requestKeyRotation,
  requestTerminalDimensions,
  sendCommandToTerminal,
} from "./events";
import { LandingPageContent } from "./LandingPageContent";
import { AesKeysRef } from "./types";
import { TopBar } from "./TopBar";

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
      <div className="flex bg-black  justify-evenly text-gray-300 py-5">
        <div>
          <a href="https://chadsmith.dev">chadsmith.dev</a> |{" "}
          <a href="https://github.com/cs01/termpair">GitHub</a>
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
    console.error(error);
    console.error(errorInfo);
  }

  render() {
    if (this.state.hasError) {
      // You can render any custom fallback UI
      return <h1 className="text-white">Something went wrong.</h1>;
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
  | "Failed to obtain encryption keys"
  | "Ready for websocket connection"
  | "Invalid encryption key"
  | "Failed to fetch terminal data";

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
  prevStatus: Status,
  setPrevStatus: (prevStatus: Status) => void
): void {
  const noToast = ["No Terminal provided"];
  if (status && noToast.indexOf(status) === -1) {
    toastStatus(<div>Terminal status: {status}</div>);
  }
  setPrevStatus(status);

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

    case "Failed to obtain encryption keys":
      xterm.writeln(
        redXtermText(
          `Failed to obtain symmetric encryption keys from the broadcasting terminal.`
        )
      );
      xterm.writeln("");
      break;

    case "Invalid encryption key":
      toast.dark(
        <>
          <div>
            Secret encryption key is not provided. Cannot establish connection.
          </div>
        </>,
        { autoClose: false }
      );
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
    case "Failed to fetch terminal data":
    case "Ready for websocket connection":
      break;

    default:
      ((_: "Unhandled switch case"): never => {
        throw Error;
      })(status);
  }
  return status as never;
}

function App() {
  const [isStaticallyHosted, setIsStaticallyHosted] =
    useState<Nullable<boolean>>(null);
  const [terminalServerData, setTerminalServerData] =
    useState<Nullable<TerminalServerData>>(null);
  const [numClients, setNumClients] = useState(0);

  const aesKeys = useRef<AesKeysRef>({
    bootstrap: null,
    browser: null,
    unix: null,
    ivCount: null,
    maxIvCount: null,
  });
  const [xtermWasOpened, setXtermWasOpened] = useState(false);
  const [terminalSize, setTerminalSize] = useState<TerminalSize>({
    rows: 20,
    cols: 81,
  });
  const [resizeTimeout, setResizeTimeout] =
    useState<Nullable<NodeJS.Timeout>>(null);
  const [status, setStatus] = useState<Status>(null);
  const [prevStatus, setPrevStatus] = useState<Status>(null);

  const defaultTermpairServer = new URL(
    `${window.location.protocol}//${window.location.hostname}:${window.location.port}${window.location.pathname}`
  );
  const [customTermpairServer, setCustomTermpairServer] = useState(
    new URLSearchParams(window.location.search).get("termpair_server_url")
  );
  const termpairHttpServer =
    isStaticallyHosted === true ? customTermpairServer : defaultTermpairServer;

  useEffect(() => {
    if (isStaticallyHosted === true && customTermpairServer) {
      toast.dark(
        `Terminal data is being routed through ${customTermpairServer.toString()}`
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customTermpairServer]);

  useEffect(() => {
    const fetchIsStaticallyHosted = async () => {
      try {
        const ret = await fetch(defaultTermpairServer.toString() + "ping", {
          mode: "same-origin",
        });
        const text = await ret.json();
        const pong = text === "pong";
        const isTermpairServer = ret.status === 200 && pong;
        setIsStaticallyHosted(!isTermpairServer);
      } catch (e) {
        setIsStaticallyHosted(true);
      }
    };
    const assignBootstrapKey = async () => {
      aesKeys.current.bootstrap = await getBootstrapAESKey();
    };
    fetchIsStaticallyHosted();
    assignBootstrapKey();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const termpairWebsocketServer = termpairHttpServer
    ? new URL(termpairHttpServer.toString().replace(/^http/, "ws"))
    : null;
  const [xterm] = useState(
    new Xterm({
      cursorBlink: true,
      macOptionIsMeta: true,
      scrollback: 1000,
    })
  );
  const [terminalId, setTerminalId] = useState(
    new URLSearchParams(window.location.search).get("terminal_id")
  );

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  const changeStatus = (newStatus: Status) => {
    setStatus(newStatus);
    handleStatusChange(xterm, terminalId, newStatus, prevStatus, setPrevStatus);
  };

  useEffect(() => {
    async function getTerminalData() {
      if (!terminalId) {
        setTerminalServerData(null);
        changeStatus("No Terminal provided");
        return;
      }
      if (!window.isSecureContext) {
        changeStatus("Browser is not running in a secure context");
        return;
      }
      if (isStaticallyHosted && !customTermpairServer) {
        toast.dark(
          "Page is statically hosted but no custom server was provided"
        );
        return;
      }
      if (!termpairHttpServer) {
        console.error("no termpair server");
        return;
      }

      if (!aesKeys.current.bootstrap) {
        const bootstrapKey = await getBootstrapAESKey();
        if (bootstrapKey) {
          // maybe a race condition?
          aesKeys.current.bootstrap = bootstrapKey;
        } else {
          setStatus("Invalid encryption key");
          return;
        }
      }
      try {
        const response = await fetch(
          new URL(`terminal/${terminalId}`, termpairHttpServer).toString()
        );
        if (response.status === 200) {
          setTerminalServerData(await response.json());
          setStatus("Ready for websocket connection");
        } else {
          changeStatus("Terminal ID is invalid");
          setTerminalServerData(null);
        }
      } catch (e) {
        changeStatus(`Failed to fetch terminal data`);
        toast.dark(
          `Error fetching terminal data from ${termpairHttpServer.toString()}. Is the URL correct? Error message: ${String(
            e.message
          )}`,

          { autoClose: false }
        );
        setTerminalServerData(null);
      }
    }
    getTerminalData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [terminalSize, xterm]);

  useEffect(() => {
    function setupWebsocketConnection() {
      if (status !== "Ready for websocket connection") {
        return;
      }
      if (!terminalServerData?.terminal_id) {
        return;
      }
      if (!termpairWebsocketServer) {
        return;
      }
      if (!aesKeys.current.bootstrap) {
        changeStatus("Invalid encryption key");
      }
      changeStatus("Connecting...");
      const connectWebsocketUrl = new URL(
        `connect_browser_to_terminal?terminal_id=${terminalId}`,
        termpairWebsocketServer
      );
      const webSocket = new WebSocket(connectWebsocketUrl.toString());

      xterm.attachCustomKeyEventHandler(
        getCustomKeyEventHandler(
          xterm,
          terminalServerData?.allow_browser_control,
          async (newInput: any) => {
            try {
              if (
                aesKeys.current.browser &&
                aesKeys.current.ivCount &&
                aesKeys.current.maxIvCount
              ) {
                webSocket.send(
                  await sendCommandToTerminal(
                    aesKeys.current.browser,
                    newInput,
                    aesKeys.current.ivCount++
                  )
                );
                if (
                  isIvExhausted(
                    aesKeys.current.ivCount,
                    aesKeys.current.maxIvCount
                  )
                ) {
                  webSocket.send(requestKeyRotation());
                  // don't want to request a new one
                  // while the current request is being processed
                  aesKeys.current.maxIvCount += 1000;
                }
              } else {
                toast.dark(
                  `Can't send ${newInput} since encryption key was not obtained. Wait and try again or refresh the page.`
                );
                return;
              }
            } catch (e) {
              toast.dark(`Failed to send data to terminal ${e}`);
            }
          }
        )
      );
      let onDataDispose: Nullable<IDisposable>;
      webSocket.addEventListener("open", async (event) => {
        if (aesKeys.current.bootstrap == null) {
          changeStatus("Invalid encryption key");
          return;
        }

        changeStatus("Connected");
        webSocket.send(requestTerminalDimensions());
        const newBrowserMessage = await newBrowserConnected();
        webSocket.send(newBrowserMessage);

        /**
         * Process user input when user types in terminal
         */
        onDataDispose = xterm.onData(async (newInput: any) => {
          try {
            if (terminalServerData.allow_browser_control === false) {
              toastStatus(cannotTypeMsg);
              return;
            }
            if (
              aesKeys.current.browser != null &&
              aesKeys.current.ivCount != null &&
              aesKeys.current.maxIvCount != null
            ) {
              webSocket.send(
                await sendCommandToTerminal(
                  aesKeys.current.browser,
                  newInput,
                  aesKeys.current.ivCount++
                )
              );
              if (
                isIvExhausted(
                  aesKeys.current.ivCount,
                  aesKeys.current.maxIvCount
                )
              ) {
                webSocket.send(requestKeyRotation());
                aesKeys.current.maxIvCount += 1000;
              }
            } else {
              toast.dark(
                `cannot send ${newInput} because encryption key is missing`
              );
            }
          } catch (e) {
            toast.dark(`Failed to send data to terminal ${e}`);
          }
        });
      });
      webSocket.addEventListener("close", (event) => {
        if (onDataDispose) {
          // stop trying to send data since the connection is closed
          onDataDispose.dispose();
        }

        changeStatus("Disconnected");
        setNumClients(0);
      });

      webSocket.addEventListener("error", (event) => {
        if (onDataDispose) {
          // stop trying to send data since the connection is closed
          onDataDispose.dispose();
        }

        toast.dark(`Websocket Error: ${event}`);
        console.error(event);
        changeStatus("Connection Error");
        setNumClients(0);
      });

      webSocket.addEventListener("message", async (message: any) => {
        const data = JSON.parse(message.data);
        if (data.event === "new_output") {
          if (!aesKeys.current.unix) {
            console.error(
              "Missing AES CryptoKey for unix terminal. Cannot decrypt message."
            );
            return;
          }
          const decryptedPayload = await aesDecrypt(
            aesKeys.current.unix,
            Buffer.from(data.payload, "base64")
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
          const num_clients = data.payload;
          setNumClients(num_clients);
        } else if (data.event === "aes_keys") {
          if (!aesKeys.current.bootstrap) {
            return;
          }
          try {
            const unixAesKeyData = await aesDecrypt(
              aesKeys.current.bootstrap,
              Buffer.from(data.payload.b64_bootstrap_unix_aes_key, "base64")
            );
            aesKeys.current.unix = await getAESKey(unixAesKeyData, ["decrypt"]);

            const browserAesKeyData = await aesDecrypt(
              aesKeys.current.bootstrap,
              Buffer.from(data.payload.b64_bootstrap_browser_aes_key, "base64")
            );
            aesKeys.current.browser = await getAESKey(browserAesKeyData, [
              "encrypt",
            ]);
            if (
              data.payload.iv_count == null ||
              data.payload.max_iv_count == null
            ) {
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
        } else if (data.event === "aes_key_rotation") {
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
            aesKeys.current.unix = await getAESKey(newUnixAesKeyData, [
              "decrypt",
            ]);
            // toast.dark("AES keys have been rotated");
          } catch (e) {
            console.error(e);
            toast.dark(`AES key rotation failed: ${e}`);
          }
        } else if (data.event === "error") {
          toast.dark(`Error: ${data.payload}`);
          console.error(data);
        } else {
          toast.dark(`Unknown event received: ${data.event}`);
          console.error("unknown event type", data);
        }
      });
    }
    setupWebsocketConnection();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [terminalServerData, status]);

  const showLandingPage =
    [
      null,
      "No Terminal provided",
      "Failed to fetch terminal data",
      "Invalid encryption key",
    ].indexOf(status) > -1 || isStaticallyHosted === null;

  const content = (
    <div className="p-5 text-white flex-grow">
      {showLandingPage ? (
        <LandingPageContent
          isStaticallyHosted={isStaticallyHosted}
          setCustomTermpairServer={setCustomTermpairServer}
          setTerminalId={setTerminalId}
          aesKeys={aesKeys}
        />
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
      <div className="flex flex-col h-screen align-middle">
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
