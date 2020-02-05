import React, { Component, useState } from "react";
import "./App.css";
import logo from "./logo.png"; // logomakr.com/4N54oK
import { Terminal as Xterm } from "xterm";
import moment from "moment";

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
  return <div id="terminal" className={props.status} ref={props.terminalEl} />;
}

function TerminalIdEntry(props) {
  const [id, setId] = useState("");
  return (
    <div id="terminal-entry">
      Enter terminal id
      <input
        value={id}
        onChange={event => {
          setId(event.target.value);
        }}
        onKeyDown={event => {
          if (event.keyCode === 13) {
            window.location = `?terminal_id=${id}`;
          }
        }}
      />
      <button onClick={() => (window.location = `?terminal_id=${id}`)}>
        Connect
      </button>
      <p>
        To view or broadcast a terminal, see instructions at{" "}
        <a href="https://github.com/cs01/termpair">
          https://github.com/cs01/termpair
        </a>
      </p>
    </div>
  );
}

class App extends Component {
  constructor(props) {
    super(props);
    this.state = {
      rows: this.props.rows || 20,
      cols: this.props.cols || 60,
      status: "connection-pending",
      num_clients: this.props.num_clients,
      terminal_id: this.props.terminal_id
    };
    this.term = new Xterm({
      cursorBlink: true,
      macOptionIsMeta: true,
      scrollback: 1000
    });
    this.terminalEl = React.createRef();
    this.term.resize(this.state.cols, this.state.rows);
  }
  render() {
    return (
      <div
        style={{
          display: "flex",
          flexDirection: "column"
        }}
      >
        <TopBar {...this.props} {...this.state} />
        {this.state.terminal_id ? (
          <Terminal {...this.props} terminalEl={this.terminalEl} />
        ) : (
          <TerminalIdEntry />
        )}

        <StatusBar {...this.props} {...this.state} />
        <BottomBar />
      </div>
    );
  }

  componentDidMount() {
    if (!this.state.terminal_id) {
      return;
    }
    const term = this.term;

    term.open(document.getElementById("terminal"));
    term.writeln(`Welcome to TermPair!`);
    term.writeln("https://github.com/cs01/termpair");
    if (!this.state.terminal_id) {
      term.writeln("");
      term.writeln("A valid terminal id was not provided.");
      term.writeln("To view or broadcast a terminal, see instructions at");
      term.writeln("https://github.com/cs01/termpair");
      this.setState({ status: "disconnected" });
      return;
    }
    term.writeln("Connecting to terminal...");
    const ws_protocol = window.location.protocol === "https:" ? "wss" : "ws";
    const socket = new WebSocket(
      `${ws_protocol}://${window.location.hostname}:${window.location.port}/connect_browser_to_terminal?terminal_id=${this.state.terminal_id}`
    );

    term.on("key", (key, ev) => {
      socket.send(key);
    });
    socket.addEventListener("open", event => {
      this.setState({ status: "connected" });
      term.writeln("Connection established");
    });

    socket.addEventListener("close", event => {
      this.setState({ status: "disconnected" });
      term.writeln("Connection ended");
      this.setState({ num_clients: 0, terminal_id: null });
    });

    socket.addEventListener("message", event => {
      const data = JSON.parse(event.data);
      if (data.event === "new_output") {
        term.write(atob(data.payload));
      } else if (data.event === "resize") {
        clearTimeout(this.resizeTimeout);
        this.resizeTimeout = setTimeout(() => {
          this.term.resize(data.payload.cols, data.payload.rows);
          this.setState({ rows: data.payload.rows, cols: data.payload.cols });
        }, 500);
      } else if (data.event === "num_clients") {
        this.setState({ num_clients: data.payload });
      } else {
        console.error("unknown event type", data);
      }
    });
  }
}

export default App;
