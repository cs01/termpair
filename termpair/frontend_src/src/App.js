import React, { Component } from "react";
import "./App.css";
import "xterm/css/xterm.css";
import logo from "./logo.png"; // logomakr.com/4N54oK
import { Terminal as Xterm } from "xterm";
import moment from "moment";
import { getSecretKey, decrypt, encrypt } from "./encryption";
function Led(props) {
  return (
    <div className="flexnowrap">
      <div className={`led led-${props.color}`} />
      <div>{props.text}</div>
    </div>
  );
}

function TopBar(props) {
  return (
    <div id="top">
      <a href="https://github.com/cs01/termpair">
        <img height="30px" src={logo} alt="logo" />
      </a>
    </div>
  );
}

function StatusBar(props) {
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
        A <a href="https://grassfedcode.com">Chad Smith</a> project
      </div>
      <div>
        <a href="https://github.com/cs01">GitHub</a>
      </div>
    </div>
  );
}

class App extends Component {
  constructor(props) {
    super(props);
    const terminalId = new URLSearchParams(window.location.search).get(
      "terminal_id"
    );
    const hasCrypto = window.crypto != null;
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
    const secretEncryptionKey = await getSecretKey();
    this.setState({ secretEncryptionKey });
    const terminalData = await (
      await fetch(`terminal/${this.state.terminalId}`)
    ).json();
    this.setState({ terminalData });

    xterm.open(document.getElementById("terminal"));

    xterm.writeln(`Welcome to TermPair! https://github.com/cs01/termpair`);
    xterm.writeln("");
    if (!terminalData.terminal_id) {
      writeInstructions(xterm);
      return;
    } else if (!secretEncryptionKey) {
      writeInstructions(xterm);
      return;
    } else if (!this.state.hasCrypto) {
      xterm.writeln("TermPair only works on secure connections.");
      writeInstructions(xterm);
      return;
    }

    // all good! proceed with connecting to terminal websocket
    const ws_protocol = window.location.protocol === "https:" ? "wss" : "ws";
    const webSocket = new WebSocket(
      `${ws_protocol}://${window.location.hostname}:${window.location.port}${window.location.pathname}connect_browser_to_terminal?terminal_id=${this.state.terminalId}`
    );

    xterm.onKey(async (pressedKey, ev) => {
      webSocket.send(await encrypt(secretEncryptionKey, pressedKey.key));
    });

    webSocket.addEventListener("open", (event) => {
      this.setState({ status: "connected" });
      xterm.writeln("Connection established with end-to-end encryption 🔒.");
      xterm.writeln(
        "The termpair server and third parties can't read transmitted data."
      );
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

    async function handleWebsocketMessage(message) {
      const data = JSON.parse(message.data);
      if (data.event === "new_output") {
        const encryptedBase64Payload = data.payload;
        const decryptedPayload = await decrypt(
          secretEncryptionKey,
          encryptedBase64Payload
        );
        xterm.writeUtf8(decryptedPayload);
      } else if (data.event === "resize") {
        clearTimeout(this.resizeTimeout);
        this.resizeTimeout = setTimeout(() => {
          xterm.resize(data.payload.cols, data.payload.rows);
        }, 500);
      } else if (data.event === "num_clients") {
        this.state.terminalData.num_clients = data.payload;
        this.setState({ terminalData: this.state.terminalData });
      } else {
        console.error("unknown event type", data);
      }
    }
    webSocket.addEventListener("message", handleWebsocketMessage.bind(this));
  }
}

function writeInstructions(xterm) {
  xterm.writeln("To broadcast a terminal, run");
  const host = `${window.location.protocol}//${window.location.hostname}${window.location.pathname}`;
  xterm.writeln("");
  xterm.writeln(
    `    pipx run termpair share --host "${host}" ${
      window.location.port ? "--port " + window.location.port : ""
    }`
  );
  xterm.writeln("");
  xterm.writeln("Then open or share the url printed to the terminal.");
  xterm.writeln("To install pipx, see https://pipxproject.github.io/pipx/");
  xterm.writeln("All terminal data is end-to-end encrypted 🔒.");
  xterm.writeln(
    "The termpair server and third parties can't read transmitted data."
  );
}

export default App;
