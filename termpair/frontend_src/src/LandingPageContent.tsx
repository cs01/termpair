import React from "react";
import { toast } from "react-toastify";
import { TERMPAIR_VERSION } from "./constants";
import { CopyCommand } from "./CopyCommand";
import { getAESKey } from "./encryption";
import { AesKeysRef } from "./types";

const host = `${window.location.protocol}//${window.location.hostname}${window.location.pathname}`;
let port = window.location.port;
if (!window.location.port) {
  if (window.location.protocol === "https:") {
    port = "443";
  } else {
    port = "80";
  }
}

const termpairShareCommand = `termpair share --host "${host}" --port ${port}`;
const pipxTermpairShareCommand = `pipx run ${termpairShareCommand}`;

export function LandingPageContent(props: {
  isStaticallyHosted: Nullable<boolean>;
  setCustomTermpairServer: (customServer: string) => void;
  setTerminalId: (newTerminalId: string) => void;
  aesKeys: React.MutableRefObject<AesKeysRef>;
}) {
  const [terminalIdInput, setTerminalIdInput] = React.useState("");
  const [customHostInput, setCustomHostInput] = React.useState("");
  const [bootstrapAesKeyB64Input, setBootstrapAesKeyB64Input] =
    React.useState("");

  const submitForm = async () => {
    if (!terminalIdInput) {
      toast.dark("Terminal ID cannot be empty");
      return;
    }
    if (!bootstrapAesKeyB64Input) {
      toast.dark("Secret key cannot be empty");
      return;
    }
    if (!props.isStaticallyHosted) {
      props.setTerminalId(terminalIdInput);
    }
    if (!customHostInput) {
      toast.dark("Host name cannot be empty");
      return;
    }
    try {
      new URL(customHostInput);
    } catch (e) {
      toast.dark(`${customHostInput} is not a valid url`);
      return;
    }
    try {
      const bootstrapKey = await getAESKey(
        Buffer.from(bootstrapAesKeyB64Input, "base64"),
        ["decrypt"]
      );
      props.aesKeys.current.bootstrap = bootstrapKey;
    } catch (e) {
      toast.dark(`Secret encryption key is not valid`);
      return;
    }
    props.setCustomTermpairServer(customHostInput);
    props.setTerminalId(terminalIdInput);
  };
  const inputClass = "text-black px-2 py-3 m-2 w-full font-mono";

  const terminalIdInputEl = (
    <div
      className="flex items-center"
      title="The unique Terminal ID the broadcasting terminal was provided when the sharing session began."
    >
      <span className="py-2 m-2 whitespace-nowrap text-xl">Terminal ID</span>
      <input
        name="terminalIdInput"
        type="text"
        className={inputClass}
        onChange={(event) => {
          setTerminalIdInput(event.target.value);
        }}
        value={terminalIdInput}
        placeholder="abcdef123456789abcded123456789"
      />
    </div>
  );
  const bootstrapCryptoKeyInputEl = (
    <div className="flex items-center" title="Base 64 encoded AES key">
      <span className="py-2 m-2 whitespace-nowrap text-xl">
        Secret encryption key
      </span>
      <input
        name="bootstrapAesKeyB64Input"
        placeholder="123456789abcded123456789"
        type="text"
        className={inputClass}
        onChange={(event) => {
          setBootstrapAesKeyB64Input(event.target.value);
        }}
        value={bootstrapAesKeyB64Input}
      />
    </div>
  );
  const terminalServerUrlEl = (
    <div
      className="flex items-center"
      title="The URL of an actual TermPair server that the terminal is broadcasting through."
    >
      <span className="py-2 m-2 whitespace-nowrap text-xl">
        TermPair Server URL
      </span>
      <input
        name="customHostInput"
        type="text"
        className={inputClass}
        placeholder="http://localhost:8000"
        onChange={(event) => {
          setCustomHostInput(event.target.value);
        }}
        value={customHostInput}
      />
    </div>
  );

  const canConnect = props.isStaticallyHosted
    ? terminalIdInput.length !== 0
    : terminalIdInput.length !== 0 && customHostInput.length !== 0;

  const connectButton = (
    <div className="flex justify-end">
      <button
        type="submit"
        title="Connect to the specified Terminal"
        className={`bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-full ${
          canConnect ? "" : "cursor-not-allowed"
        }`}
      >
        Connect
      </button>
    </div>
  );
  const connectForm = (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        submitForm();
      }}
    >
      {terminalIdInputEl}
      {bootstrapCryptoKeyInputEl}
      {props.isStaticallyHosted ? terminalServerUrlEl : null}
      {connectButton}
    </form>
  );
  const staticLandingContent = (
    <div className="py-2">
      <div className="text-2xl py-2">This page is statically hosted</div>
      <div>
        This is a static page serving the TermPair JavaScript app. It is
        optional to use a statically served TermPair webapp, but it facilitates
        easily building and self-serving to be certain the JavaScript app has
        not been tampered with by an untrusted server.
      </div>
      <div className="mt-5">
        Connect to a broadcasting terminal by entering the fields below and
        clicking Connect.
      </div>
      {connectForm}
    </div>
  );

  const regularServerContent = (
    <>
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
        <div className="text-xl  py-2">Connecting to a Terminal?</div>
        If a terminal is already broadcasting and you'd like to connect to it,
        you don't need to install or run anything. Just fill out the form below
        and click Connect.
        {connectForm}
      </div>
    </>
  );

  const termpairDemoContent = (
    <div className="py-2">
      <div className="text-xl  py-2">TermPair Demo</div>
      <div>
        <img
          alt="Screencast of TermPair"
          src="https://raw.githubusercontent.com/cs01/termpair/master/termpair_browser.gif"
        />
      </div>
    </div>
  );

  return (
    <div className="flex justify-center">
      <div className="text-gray-200 max-w-3xl">
        <div className="py-2">
          <div className="text-3xl ">Welcome to TermPair!</div>
          Easily share terminals with end-to-end encryption 🔒. Terminal data is
          always encrypted before being routed through the server.{" "}
          <a href="https://github.com/cs01/termpair">Learn more.</a>
        </div>
        {props.isStaticallyHosted === null
          ? null
          : props.isStaticallyHosted === true
          ? staticLandingContent
          : regularServerContent}

        <div className="py-2">
          <div className="text-2xl py-2">Troubleshooting</div>
          <div className="text-xl ">
            Initial connection fails or is rejected
          </div>
          <div>
            Ensure you are using a TermPair client compatible with{" "}
            <span className="font-bold">v{TERMPAIR_VERSION}</span> (the version
            of this webpage)
          </div>
        </div>
        {termpairDemoContent}
      </div>
    </div>
  );
}
