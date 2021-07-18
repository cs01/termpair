import React, { Component, useRef, useEffect, useState } from "react";
import "xterm/css/xterm.css";
import logo from "./logo.png"; // logomakr.com/4N54oK
// import { CogIcon } from "@heroicons/react/solid";
import { Terminal as Xterm, IDisposable } from "xterm";
import moment from "moment";
import { getSecretKey, decrypt, encrypt } from "./encryption";

import { atom, useRecoilState } from "recoil";

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
        <a href="https://github.com/cs01/termpair">
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

function BottomBar(props: any) {
  const connected = props.status === "connected";
  const hasTerminalId = props.terminalId != null;
  const status = hasTerminalId ? <div>{props.status}</div> : null;
  const canType = connected ? (
    <div>
      {props.terminalData?.allow_browser_control && props.status === "connected"
        ? "can type"
        : "cannot type"}
    </div>
  ) : null;
  const connectedClients = connected ? (
    <div>
      {props.terminalData?.num_clients ? props.terminalData?.num_clients : "0"}{" "}
      Connected Clients
    </div>
  ) : null;
  const startTime = connected ? (
    <div>
      Started at{" "}
      {moment(props.terminalData?.broadcast_start_time_iso).format(
        "h:mm a on MMM Do YYYY"
      )}
    </div>
  ) : null;
  return (
    <>
      <div
        className={`flex ${
          connected ? "bg-green-900" : "bg-red-900"
        }   justify-evenly text-gray-300`}
      >
        {status}
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

type AppState = {
  terminalData: Nullable<{
    terminal_id?: string;
    allow_browser_control?: boolean;
  }>;
  terminalId: Nullable<string>;
  hasCrypto: boolean;
  status: "connection-pending" | "connected" | "disconnected";
  num_clients: Nullable<number>;
  secretEncryptionKey: Nullable<CryptoKey>;
};

type AppProps = {};

class App extends Component<AppProps, AppState> {
  terminalRef: any;
  xterm: Xterm;
  constructor(props: {}) {
    super(props);
    const terminalId = new URLSearchParams(window.location.search).get(
      "terminal_id"
    );
    const hasCrypto = window.crypto != null && window.crypto.subtle != null;
    this.state = {
      terminalData: {},
      terminalId,
      hasCrypto,
      status: terminalId && hasCrypto ? "connection-pending" : "disconnected",
      num_clients: null,
      secretEncryptionKey: null,
    };
    this.xterm = new Xterm({
      cursorBlink: true,
      macOptionIsMeta: true,
      scrollback: 1000,
    });
    this.terminalRef = React.createRef();
    const defaultCols = 90;
    const defaultRows = 20;
    this.xterm.resize(defaultCols, defaultRows);
  }

  render() {
    const content = (
      <div
        id="terminal"
        className="p-3 bg-black flex-grow text-gray-400"
        ref={this.terminalRef.current}
      ></div>
    );
    return (
      <ErrorBoundary>
        <div className="flex flex-col h-screen">
          <Settings />
          <TopBar {...this.props} {...this.state} />
          {content}
          <BottomBar {...this.state} />
        </div>
      </ErrorBoundary>
    );
  }

  async componentDidMount() {
    const xterm = this.xterm;
    const el = document.getElementById("terminal");
    if (!el) {
      console.error("no xterm element found");
      return;
    }
    xterm.open(el);

    if (!this.state.hasCrypto) {
      xterm.writeln(
        "\x1b[1;31mFatal Error: TermPair only works on secure connections. Ensure url starts with https. See `termpair serve --help` for more information.\x1b[0m"
      );
      xterm.writeln("");
      writeInstructions(xterm);
      return;
    }
    const secretEncryptionKey = await getSecretKey();
    this.setState({ secretEncryptionKey });
    let terminalData = null;
    try {
      terminalData = await (
        await fetch(`terminal/${this.state.terminalId}`)
      ).json();
    } catch (e) {}
    this.setState({ terminalData });

    xterm.writeln(`Welcome to TermPair! https://github.com/cs01/termpair`);
    xterm.writeln("");
    if (!terminalData?.terminal_id) {
      writeInstructions(xterm);
      return;
    }
    if (!secretEncryptionKey) {
      writeInstructions(xterm);
      return;
    }

    // all good! proceed with connecting to terminal websocket
    const ws_protocol = window.location.protocol === "https:" ? "wss" : "ws";
    const webSocket = new WebSocket(
      `${ws_protocol}://${window.location.hostname}:${window.location.port}${window.location.pathname}connect_browser_to_terminal?terminal_id=${this.state.terminalId}`
    );

    xterm.attachCustomKeyEventHandler(
      getCustomKeyEventHandler(
        xterm,
        this.state?.terminalData?.allow_browser_control,
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
      this.setState({ status: "connected" });
      xterm.writeln("Connection established with end-to-end encryption 🔒.");
      xterm.writeln(
        "The termpair server and third parties can't read transmitted data."
      );
      xterm.writeln("");
      xterm.writeln(
        "You can copy text with ctrl+shift+c or ctrl+shift+x, and paste with ctrl+shift+v."
      );
      xterm.writeln("");

      onDataDispose = xterm.onData(async (data: any) => {
        try {
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

      if (this.state.status === "connected") {
        xterm.writeln("Connection ended");
      } else {
        xterm.writeln(
          "Failed to establish connection. Ensure you have a valid url."
        );
      }
      writeInstructions(xterm);
      this.setState({ status: "disconnected" });
      this.setState({ num_clients: 0 });
    });

    webSocket.addEventListener("error", (event) => {
      if (onDataDispose) {
        // stop trying to send data since the connection is closed
        onDataDispose.dispose();
      }

      console.error(event);
      this.setState({ status: "disconnected" });
      this.setState({ num_clients: 0 });
    });

    const handleWebsocketMessage = async (message: any) => {
      const data = JSON.parse(message.data);
      if (data.event === "new_output") {
        const encryptedBase64Payload = data.payload;
        const decryptedPayload = await decrypt(
          secretEncryptionKey,
          encryptedBase64Payload
        );
        xterm.write(decryptedPayload);
      } else if (data.event === "resize") {
        // @ts-ignore
        clearTimeout(this.resizeTimeout);
        // @ts-ignore
        this.resizeTimeout = setTimeout(() => {
          xterm.resize(data.payload.cols, data.payload.rows);
        }, 500);
      } else if (data.event === "num_clients") {
        // @ts-ignore
        this.state.terminalData.num_clients = data.payload;
        // @ts-ignore
        this.setState({ terminalData: this.state.terminalData });
      } else {
        console.error("unknown event type", data);
      }
    };
    webSocket.addEventListener("message", handleWebsocketMessage);
  }
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
  function customKeyEventHandler(e: any) {
    if (e.type !== "keydown") {
      return true;
    }
    if (e.ctrlKey && e.shiftKey) {
      const key = e.key.toLowerCase();
      if (key === "v") {
        if (!canType) {
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
