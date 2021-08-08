import React from "react";
import { toast } from "react-toastify";
import {
  defaultTermpairServer,
  pipxTermpairShareCommand,
  termpairShareCommand,
  TERMPAIR_VERSION,
} from "./constants";
import { CopyCommand } from "./CopyCommand";
import { getAESKey } from "./encryption";
import { websocketUrlFromHttpUrl } from "./utils";

export function LandingPageContent(props: {
  isStaticallyHosted: Nullable<boolean>;
  connectToTerminalAndWebsocket: (
    terminalId: string,
    termpairWebsocketServer: URL,
    termpairHttpServer: URL,
    bootstrapAesKey: CryptoKey
  ) => Promise<void>;
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
    if (props.isStaticallyHosted) {
      if (!customHostInput) {
        toast.dark("Host name cannot be empty");
        return;
      } else {
        try {
          new URL(customHostInput);
        } catch (e) {
          toast.dark(`${customHostInput} is not a valid url`);
          return;
        }
      }
      let bootstrapKey;
      try {
        bootstrapKey = await getAESKey(
          Buffer.from(bootstrapAesKeyB64Input, "base64"),
          ["decrypt"]
        );
      } catch (e) {
        toast.dark(`Secret encryption key is not valid`);
        return;
      }
      let termpairHttpServer: URL;
      if (props.isStaticallyHosted) {
        const customServer = new URL(customHostInput);
        termpairHttpServer = customServer;
      } else {
        termpairHttpServer = defaultTermpairServer;
      }
      const termpairWebsocketServer =
        websocketUrlFromHttpUrl(termpairHttpServer);

      await props.connectToTerminalAndWebsocket(
        terminalIdInput,
        termpairWebsocketServer,
        termpairHttpServer,
        bootstrapKey
      );
    }
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

  const canConnect =
    terminalIdInput.length !== 0 &&
    bootstrapAesKeyB64Input.length > 0 &&
    props.isStaticallyHosted
      ? customHostInput.length !== 0
      : true;

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
      <div className="text-xl py-2">TermPair Demo</div>
      {/* https://www.themes.dev/blog/easily-embed-responsive-youtube-video-with-tailwind-css/ */}
      <div className="aspect-w-16 aspect-h-9">
        <iframe
          src="https://www.youtube.com/embed/HF0UX4smrKk"
          title="YouTube video player"
          frameBorder="0"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
        ></iframe>
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
