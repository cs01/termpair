import React, { Component } from "react";
import "./App.css";
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

function BottomBar() {
  return (
    <div id="bottom">
      <div>
        A <a href="https://grassfedcode.com">Chad Smith</a> project
      </div>
      <div>
        <a href="https://github.com/cs01">GitHub</a>
      </div>
      <div>
        <a href="https://twitter.com/grassfedcode">Twitter</a>
      </div>
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
        {props.allow_browser_control ? (
          <Led color="green" text="can type" />
        ) : (
          <Led color="orange" text="cannot type" />
        )}
      </div>
      <div>{props.num_clients ? props.num_clients : "0"} Connected Clients</div>
      <div>
        Started at{" "}
        {moment(props.broadcast_start_time_iso).format(
          "h:mm:ss a on MMM Do YYYY"
        )}
      </div>
    </div>
  );
}
function Terminal(props) {
  return (
    <div
      id="terminal"
      className={props.status}
      ref={props.terminalRef.current}
    />
  );
}

function BroadcastInstructions(props) {
  const host = `${window.location.protocol}//${window.location.hostname}${window.location.pathname}`;
  return (
    <div id="terminal-entry">
      <p>{props.error}</p>
      <p>To broadcast a terminal, run</p>
      <pre>
        pipx run termpair=={props.termpair_version} share --host "{host}"
      </pre>
      <p>then open the link printed to the terminal.</p>
    </div>
  );
}

class App extends Component {
  constructor(props) {
    super(props);
    this.state = {
      status:
        props.terminal_id && window.crypto != null
          ? "connection-pending"
          : "disconnected",
      num_clients: this.props.num_clients,
      terminal_id: this.props.terminal_id,
      secretEncryptionKey: "pending"
    };
    this.xterm = new Xterm({
      cursorBlink: true,
      macOptionIsMeta: true,
      scrollback: 1000
    });
    this.terminalRef = React.createRef();
    this.xterm.resize(props.cols || 60, props.rows || 20);
  }
  render() {
    const hasEncryption = window.crypto != null;
    let body;
    if (!hasEncryption) {
      body = (
        <BroadcastInstructions
          error={
            "This domain is not secure and thus cannot perform in-browser encryption/decryption."
          }
          {...this.props}
        />
      );
    } else if (!this.state.terminal_id) {
      body = (
        <BroadcastInstructions
          {...this.props}
          error={"Valid terminal id not provided."}
        />
      );
    } else if (this.state.secretEncryptionKey == null) {
      body = (
        <BroadcastInstructions
          {...this.props}
          error={"Encryption key is invalid or missing"}
        />
      );
    } else {
      body = <Terminal {...this.props} terminalRef={this.terminalRef} />;
    }
    return (
      <div
        style={{
          display: "flex",
          flexDirection: "column"
        }}
      >
        <TopBar {...this.props} {...this.state} />
        {body}
        <StatusBar {...this.props} {...this.state} />
        <BottomBar />
      </div>
    );
  }

  async componentDidMount() {
    if (!this.state.terminal_id) {
      return;
    }
    const secretEncryptionKey = await getSecretKey();
    this.setState({ secretEncryptionKey });
    const xterm = this.xterm;

    xterm.open(document.getElementById("terminal"));
    xterm.writeln(`Welcome to TermPair! https://github.com/cs01/termpair`);
    if (!this.state.terminal_id || !secretEncryptionKey) {
      xterm.writeln("");
      xterm.writeln("A valid terminal id and e2ee key must be provided.");
      xterm.writeln("To view or broadcast a terminal, see instructions at");
      xterm.writeln("https://github.com/cs01/termpair");
      this.setState({ status: "disconnected" });
      return;
    }
    const ws_protocol = window.location.protocol === "https:" ? "wss" : "ws";
    const webSocket = new WebSocket(
      `${ws_protocol}://${window.location.hostname}:${window.location.port}${window.location.pathname}connect_browser_to_terminal?terminal_id=${this.state.terminal_id}`
    );

    xterm.on("key", async (pressedKey, ev) => {
      webSocket.send(await encrypt(secretEncryptionKey, pressedKey));
    });

    webSocket.addEventListener("open", event => {
      this.setState({ status: "connected" });
      xterm.writeln("Connection established with end-to-end encryption,");
      xterm.writeln(
        "which means the termpair server and third parties can't read transmitted data."
      );
    });

    webSocket.addEventListener("close", event => {
      if (this.state.status === "connected") {
        xterm.writeln("Connection ended");
      } else {
        xterm.writeln(
          "Failed to establish connection. Ensure you have a valid url."
        );
        xterm.writeln("To view or broadcast a terminal, see instructions at");
        xterm.writeln("https://github.com/cs01/termpair");
      }
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
        xterm.write(decryptedPayload);
      } else if (data.event === "resize") {
        clearTimeout(this.resizeTimeout);
        this.resizeTimeout = setTimeout(() => {
          xterm.resize(data.payload.cols, data.payload.rows);
        }, 500);
      } else if (data.event === "num_clients") {
        this.setState({ num_clients: data.payload });
      } else {
        console.error("unknown event type", data);
      }
    }
    webSocket.addEventListener("message", handleWebsocketMessage.bind(this));
  }
}

export default App;
