import { Status, TerminalServerData, TerminalSize } from "./types";
import moment from "moment";

export function BottomBar(props: {
  status: Status;
  terminalData: Nullable<TerminalServerData>;
  terminalId: Nullable<string>;
  terminalSize: TerminalSize;
  numClients: number;
}) {
  const connected = props.status === "Connection Established";
  const hasTerminalId = props.terminalId != null;
  const status = hasTerminalId ? <div>{props.status}</div> : null;

  const canType = connected ? (
    <div
      title="Whether you are allowed to send data to the terminal's input.
      This setting is controlled when initially sharing the terminal, and cannot be changed
      after sharing has begun."
    >
      {props.terminalData?.allow_browser_control && connected
        ? "read/write"
        : "read only"}
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
    <div title="Dimensions of terminal, rows x cols">
      {props.terminalSize.rows}x{props.terminalSize.cols}
    </div>
  ) : null;

  return (
    <div>
      {hasTerminalId ? (
        <div
          className={`py-1 flex flex-wrap space-x-3 items-center ${
            connected ? "bg-green-900" : "bg-red-900"
          }   justify-evenly text-gray-300`}
        >
          {status}
          {terminalDimensions}
          {canType}
          {connectedClients}
          {startTime}
        </div>
      ) : null}
      <footer className="flex bg-black  justify-evenly text-gray-300 py-5">
        <div>
          <a href="https://chadsmith.dev">chadsmith.dev</a> |{" "}
          <a href="https://github.com/cs01/termpair">GitHub</a>
        </div>
      </footer>
    </div>
  );
}
