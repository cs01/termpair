import React, { Component } from "react";
import "./App.css";
import "xterm/css/xterm.css";
import logo from "./logo.png"; // logomakr.com/4N54oK
import { Terminal as Xterm } from "xterm";
import moment from "moment";
import { getSecretKey, decrypt, encrypt } from "./encryption";
function Led(props: any) {
  return (
    <div className="flexnowrap">
      <div className={`led led-${props.color}`} />
      <div>{props.text}</div>
    </div>
  );
}

function TopBar(props: any) {
  return (
    <div id="top">
      <a href="https://github.com/cs01/termpair">
        <img height="30px" src={logo} alt="logo" />
      </a>
    </div>
  );
}

function StatusBar(props: any) {
  return (
    <div id="statusbar">
      {" "}
      <div>
        {props.status === "connected" ? (
          <Led color="green" text={props.status} />
        ) : (
          <Led color="red" text={props.status} />
        )}
      </div>
      <div>
        {props.terminalData.allow_browser_control &&
        props.status === "connected" ? (
          <Led color="green" text="can type" />
        ) : (
          <Led color="orange" text="cannot type" />
        )}
      </div>
      <div>
        {props.terminalData.num_clients ? props.terminalData.num_clients : "0"}{" "}
        Connected Clients
      </div>
      <div>
        Started at{" "}
        {moment(props.terminalData.broadcast_start_time_iso).format(
          "h:mm:ss a on MMM Do YYYY"
        )}
      </div>
    </div>
  );
}

function BottomBar() {
  return (
    <div id="bottom">
      <div>
        A <a href="https://chadsmith.dev">Chad Smith</a> project
      </div>
      <div>
        <a href="https://github.com/cs01">GitHub</a>
      </div>
    </div>
  );
}

type AppState = any;
type AppProps = any;
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
      secretEncryptionKey: "pending",
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
    return (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
        }}
      >
        <TopBar {...this.props} {...this.state} />
        <div id="terminal" ref={this.terminalRef.current} />
        {this.state.terminalId ? (
          <StatusBar {...this.props} {...this.state} />
        ) : null}
        <BottomBar />
      </div>
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
    const terminalData = await (
      await fetch(`terminal/${this.state.terminalId}`)
    ).json();
    this.setState({ terminalData });

    xterm.writeln(`Welcome to TermPair! https://github.com/cs01/termpair`);
    xterm.writeln("");
    if (!terminalData.terminal_id) {
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
        this.props?.terminalData?.allow_browser_control,
        async (newInput: any) => {
          webSocket.send(await encrypt(secretEncryptionKey, newInput));
        }
      )
    );

    xterm.onData(async (data: any) => {
      webSocket.send(await encrypt(secretEncryptionKey, data));
    });

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
    });

    webSocket.addEventListener("close", (event) => {
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

function writeInstructions(xterm: any) {
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
  terminal: any,
  canType: any,
  sendInputToTerminal: any
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
