import React, { Component } from "react";
import "./App.css";
import logo from "./logo.png"; // logomakr.com/4N54oK
import { Terminal } from "xterm";
import moment from "moment";

function Led(props) {
  return (
    <div
      style={{
        overflow: "hidden",
        whiteSpace: "nowrap"
      }}
    >
      <div
        style={{ display: "inline-block", marginRight: "5px" }}
        className={`led led-${props.color}`}
      />
      <span>{props.text}</span>
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
      num_clients: this.props.num_clients
    };
    this.term = new Terminal({
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
          display: "grid",
          gridTemplateColumns: "1fr 4fr"
        }}
      >
        <div id="stats">
          <a href="https://github.com/cs01/termpair">
            <img src={logo} width="200px" alt="logo" />
          </a>
          <table>
            <tbody>
              <tr>
                <td>Status</td>
                <td>
                  {this.state.status === "connected" ? (
                    <Led color="green" text={this.state.status} />
                  ) : (
                    <Led color="red" text={this.state.status} />
                  )}
                </td>
              </tr>
              <tr>
                <td>Control</td>
                <td>
                  {this.props.allow_browser_control ? (
                    <Led color="green" text="enabled" />
                  ) : (
                    <Led color="orange" text="disabled" />
                  )}
                </td>
              </tr>
              <tr>
                <td>Connected Clients</td>
                <td>{this.state.num_clients}</td>
              </tr>
              <tr>
                <td>Broadcast start time</td>
                <td>
                  {moment(this.props.broadcast_start_time_iso).format(
                    "dddd, MMMM Do YYYY, h:mm:ss a"
                  )}
                </td>
              </tr>
              <tr>
                <td>Rows</td>
                <td>{this.state.rows}</td>
              </tr>
              <tr>
                <td>Columns</td>
                <td>{this.state.cols}</td>
              </tr>
            </tbody>
          </table>

          <div style={{ position: "absolute", bottom: 0, textAlign: "center" }}>
            <p>
              Built by Chad Smith <br />{" "}
              <a href="https://github.com/cs01">GitHub</a> |{" "}
              <a href="https://twitter.com/grassfedcode">Twitter</a>
            </p>
            <p>
              Powered by{" "}
              <a href="https://github.com/bocadilloproject/bocadillo">
                Bocadillo
              </a>
            </p>
          </div>
        </div>

        <div id="content">
          <div
            id="terminal"
            className={this.state.status}
            ref={this.terminalEl}
          />
        </div>
      </div>
    );
  }

  componentDidMount() {
    const term = this.term;

    term.open(document.getElementById("terminal"));
    term.writeln(`Welcome to TermPair!`);
    term.writeln("https://github.com/cs01/termpair");
    if (!this.props.terminal_id) {
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
      `${ws_protocol}://${window.location.hostname}:${
        window.location.port
      }/connect_browser_to_terminal?id=${this.props.terminal_id}`
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
      this.setState({ num_clients: 0 });
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
