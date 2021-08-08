import React, { useEffect, useState, useRef, useLayoutEffect } from "react";
import "xterm/css/xterm.css";
import { Terminal as Xterm, IDisposable } from "xterm";
import { getBootstrapAESKey } from "./encryption";
import { ToastContainer, toast } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import { newBrowserConnected, requestTerminalDimensions } from "./events";
import { LandingPageContent } from "./LandingPageContent";
import { AesKeysRef, Status, TerminalServerData, TerminalSize } from "./types";
import { TopBar } from "./TopBar";
import { ErrorBoundary } from "./ErrorBoundary";
import { BottomBar } from "./BottomBar";
import { defaultTerminalId, defaultTermpairServer, xterm } from "./constants";
import { toastStatus, websocketUrlFromHttpUrl } from "./utils";
import {
  getCustomKeyEventHandler,
  getOnDataHandler,
  redXtermText,
} from "./xtermUtils";
import { handlers, TermPairEvent } from "./websocketMessageHandler";

function handleStatusChange(
  status: Status,
  prevStatus: Status,
  setPrevStatus: (prevStatus: Status) => void
): void {
  setPrevStatus(status);
  switch (status) {
    case null:
      break;
    case "Connection Established":
      toastStatus(status);
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
      toastStatus(status);
      if (prevStatus === "Connection Established") {
        xterm.writeln(redXtermText("Terminal session has ended"));
        xterm.writeln("");
      }
      break;
    case "Terminal ID is invalid":
      toast.dark(
        `An invalid Terminal ID was provided. ` +
          `Check that the session is still being broadcast and that the ID is entered correctly.`
      );
      break;

    case "Failed to obtain encryption keys":
      toast.dark(
        `Failed to obtain secret encryption keys from the broadcasting terminal. ` +
          `Is your encryption key valid?`
      );
      break;

    case "Browser is not running in a secure context":
      toast.dark(
        "Fatal Error: TermPair only works on secure connections. Ensure url starts with https. " +
          "See https://developer.mozilla.org/en-US/docs/Web/Security/Secure_Contexts and `termpair serve --help` for more information."
      );
      break;

    case "Connecting...":
      break;

    case "Connection Error":
      break;

    case "Failed to fetch terminal data":
      break;

    default:
      ((_: "Unhandled switch case"): never => {
        throw Error;
      })(status);
  }
  return status as never;
}

function ensureXtermIsOpen(
  xtermWasOpened: React.MutableRefObject<boolean>,
  xterm: Xterm
) {
  if (xtermWasOpened.current) {
    return;
  }
  const el = document.getElementById("terminal");
  if (!el) {
    return;
  }
  xterm.open(el);
  xtermWasOpened.current = true;
  xterm.writeln(`Welcome to TermPair! https://github.com/cs01/termpair`);
  xterm.writeln("");
}

function App() {
  const [isStaticallyHosted, setIsStaticallyHosted] =
    useState<Nullable<boolean>>(null);
  const [terminalServerData, setTerminalServerData] =
    useState<Nullable<TerminalServerData>>(null);
  const [numClients, setNumClients] = useState(0);

  const aesKeys = useRef<AesKeysRef>({
    browser: null,
    unix: null,
    ivCount: null,
    maxIvCount: null,
  });
  const xtermWasOpened = useRef(false);
  const [webSocket, setWebsocket] = useState<Nullable<WebSocket>>(null);
  const showTerminal = webSocket !== null;
  const [terminalSize, setTerminalSize] = useState<TerminalSize>({
    rows: 20,
    cols: 81,
  });
  const [status, setStatus] = useState<Status>(null);
  const [prevStatus, setPrevStatus] = useState<Status>(null);
  const [terminalId, setTerminalId] = useState(defaultTerminalId);

  useEffect(() => {
    // run once when initially opened
    const initialize = async () => {
      let staticallyHosted;
      try {
        const ret = await fetch(defaultTermpairServer.toString() + "ping", {
          mode: "same-origin",
        });
        const text = await ret.json();
        const pong = text === "pong";
        const isTermpairServer = ret.status === 200 && pong;
        staticallyHosted = !isTermpairServer;
        setIsStaticallyHosted(staticallyHosted);
      } catch (e) {
        staticallyHosted = true;
        setIsStaticallyHosted(staticallyHosted);
      }
      const bootstrapKey = await getBootstrapAESKey();

      const termpairServerUrlParam = new URLSearchParams(
        window.location.search
      ).get("termpair_server_url");

      const customTermpairServer = termpairServerUrlParam
        ? new URL(termpairServerUrlParam)
        : null;

      const termpairHttpServer = staticallyHosted
        ? customTermpairServer
        : defaultTermpairServer;

      if (terminalId && termpairHttpServer && bootstrapKey) {
        const termpairWebsocketServer =
          websocketUrlFromHttpUrl(termpairHttpServer);

        await connectToTerminalAndWebsocket(
          terminalId,
          termpairWebsocketServer,
          termpairHttpServer,
          bootstrapKey
        );
      }
    };
    initialize();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useLayoutEffect(() => {
    ensureXtermIsOpen(xtermWasOpened, xterm);
  }, [showTerminal]);

  const changeStatus = (newStatus: Status) => {
    setStatus(newStatus);
    handleStatusChange(newStatus, prevStatus, setPrevStatus);
  };

  async function connectToTerminalAndWebsocket(
    terminalId: string,
    termpairWebsocketServer: URL,
    termpairHttpServer: URL,
    bootstrapAesKey: CryptoKey
  ) {
    setTerminalId(terminalId);
    setTerminalServerData(null);
    try {
      const response = await fetch(
        new URL(`terminal/${terminalId}`, termpairHttpServer).toString()
      );
      if (response.status === 200) {
        const data: TerminalServerData = await response.json();
        setTerminalServerData(data);
        setupWebsocket(
          terminalId,
          data,
          termpairWebsocketServer,
          bootstrapAesKey
        );
      } else {
        changeStatus("Terminal ID is invalid");
      }
    } catch (e) {
      changeStatus(`Failed to fetch terminal data`);
      toast.dark(
        `Error fetching terminal data from ${termpairHttpServer.toString()}. Is the URL correct? Error message: ${String(
          e.message
        )}`,

        { autoClose: false }
      );
    }
  }

  function setupWebsocket(
    terminalId: string,
    terminalServerData: TerminalServerData,
    termpairWebsocketServer: URL,
    bootstrapAesKey: CryptoKey
  ) {
    if (webSocket) {
      toast.dark("Closing existing connection");
      webSocket.close();
    }
    changeStatus("Connecting...");
    const connectWebsocketUrl = new URL(
      `connect_browser_to_terminal?terminal_id=${terminalId}`,
      termpairWebsocketServer
    );
    const ws = new WebSocket(connectWebsocketUrl.toString());
    setWebsocket(ws);
    const handleNewInput = getOnDataHandler(ws, terminalServerData, aesKeys);
    xterm.attachCustomKeyEventHandler(
      getCustomKeyEventHandler(
        xterm,
        terminalServerData?.allow_browser_control,
        handleNewInput
      )
    );
    let onDataDispose: Nullable<IDisposable>;
    ws.addEventListener("open", async (event) => {
      changeStatus("Connection Established");
      ws.send(requestTerminalDimensions());
      const newBrowserMessage = await newBrowserConnected();
      ws.send(newBrowserMessage);
      onDataDispose = xterm.onData(handleNewInput);
    });
    ws.addEventListener("close", (event) => {
      if (onDataDispose) {
        // stop trying to send data since the connection is closed
        onDataDispose.dispose();
      }
      changeStatus("Disconnected");
      setNumClients(0);
    });

    ws.addEventListener("error", (event) => {
      if (onDataDispose) {
        // stop trying to send data since the connection is closed
        onDataDispose.dispose();
      }

      console.error(event);
      toast.dark(`Websocket Connection Error: ${JSON.stringify(event)}`);
      changeStatus("Connection Error");
      setNumClients(0);
    });

    ws.addEventListener("message", async (message: { data: any }) => {
      let data: { event: TermPairEvent; [key: string]: any };
      try {
        data = JSON.parse(message.data);
      } catch (e) {
        toast.dark("Failed to parse websocket message");
        return;
      }

      switch (data.event) {
        case "new_output":
          return handlers.new_output(aesKeys, data);
        case "resize":
          return handlers.resize(data, setTerminalSize);
        case "num_clients":
          return handlers.num_clients(setNumClients, data);
        case "aes_keys":
          return handlers.aes_keys(
            aesKeys,
            bootstrapAesKey,
            data,
            changeStatus
          );
        case "aes_key_rotation":
          return handlers.aes_key_rotation(aesKeys, data);
        case "error":
          return handlers.error(data);
        default:
          ((_: "Unhandled switch case"): never => {
            throw Error;
          })(data.event);
          return handlers.default(data);
      }
    });
  }

  const content = (
    <div className="p-5 text-white flex-grow">
      {showTerminal ? (
        <div
          id="terminal"
          className={` p-3 bg-black flex-grow text-gray-400`}
        ></div>
      ) : (
        <LandingPageContent
          isStaticallyHosted={isStaticallyHosted}
          connectToTerminalAndWebsocket={connectToTerminalAndWebsocket}
        />
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

export default App;
