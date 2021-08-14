import { useState } from "react";
import CopyToClipboard from "react-copy-to-clipboard";
import { DuplicateIcon } from "@heroicons/react/solid";

export function CopyCommand(props: { command: string }) {
  const [clicked, setClicked] = useState(false);
  const [hovering, setHovering] = useState(false);
  return (
    <div className="flex">
      <code
        className={`${
          hovering || clicked ? "bg-yellow-200" : "bg-gray-300"
        } text-black px-2 py-1 m-2 break-all`}
      >
        {props.command}
      </code>
      <CopyToClipboard text={props.command}>
        <button
          className="px-2"
          title="Copy command to clipboard"
          onMouseEnter={() => setHovering(true)}
          onMouseLeave={() => setHovering(false)}
          onClick={() => {
            setClicked(true);
            setTimeout(() => setClicked(false), 1500);
          }}
        >
          <DuplicateIcon className="h-6 w-6 text-white" />
        </button>
      </CopyToClipboard>
      <span className="py-1 m-2">{clicked ? "Copied!" : ""}</span>
    </div>
  );
}
