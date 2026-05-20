import { useState } from "react";

export function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    await navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <button
      onClick={handleCopy}
      className="text-xs text-gray-400 hover:text-[#00e5d0] transition-colors px-2 py-1 rounded"
    >
      {copied ? "Copied!" : "Copy"}
    </button>
  );
}
