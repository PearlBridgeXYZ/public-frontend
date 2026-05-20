import { useState } from "react";
import { RELAY_API_BASE } from "../lib/config";

type Severity = "critical" | "high" | "medium" | "low";
type SubmitState = "idle" | "submitting" | "success" | "error";

export function BugBountyModal() {
  const [open, setOpen] = useState(false);
  const [severity, setSeverity] = useState<Severity>("medium");
  const [description, setDescription] = useState("");
  const [contact, setContact] = useState("");
  const [submitState, setSubmitState] = useState<SubmitState>("idle");

  function onClose() {
    setOpen(false);
    // reset after close animation settles
    setTimeout(() => {
      setSubmitState("idle");
      setSeverity("medium");
      setDescription("");
      setContact("");
    }, 200);
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!description.trim()) return;
    setSubmitState("submitting");
    try {
      const res = await fetch(`${RELAY_API_BASE}/api/bug-report`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          severity,
          description: description.trim(),
          contact: contact.trim() || undefined,
        }),
      });
      if (res.status === 429) {
        setSubmitState("error");
        return;
      }
      if (!res.ok) {
        setSubmitState("error");
        return;
      }
      setSubmitState("success");
    } catch {
      setSubmitState("error");
    }
  }

  return (
    <>
      {/* Trigger link — matches footer text color */}
      <button
        onClick={() => setOpen(true)}
        className="text-gray-600 hover:text-gray-400 transition-colors underline underline-offset-2 text-xs"
      >
        Security Disclosure
      </button>

      {/* Modal overlay */}
      {open && (
        <div
          className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="bug-bounty-title"
          onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
        >
          <div className="glass-strong rounded-3xl max-w-lg w-full border border-white/10 shadow-2xl">
            {/* Header */}
            <div className="px-6 pt-6 pb-3 border-b border-white/5 flex items-start justify-between">
              <div>
                <h2 id="bug-bounty-title" className="text-lg font-bold text-white">
                  Security Disclosure
                </h2>
                <p className="text-xs text-gray-400 mt-1">
                  Found a vulnerability? Report it responsibly. Valid reports receive
                  recognition and may qualify for a bounty.
                </p>
              </div>
              <button
                onClick={onClose}
                className="text-gray-500 hover:text-gray-300 transition-colors ml-4 mt-0.5 text-lg leading-none"
                aria-label="Close"
              >
                ✕
              </button>
            </div>

            {/* Body */}
            <div className="px-6 py-5">
              {submitState === "success" ? (
                <p className="text-sm text-gray-300 py-4 text-center">
                  Thank you. We'll review your report and respond if you provided
                  contact details.
                </p>
              ) : (
                <form onSubmit={onSubmit} className="space-y-4">
                  {submitState === "error" && (
                    <p className="text-xs text-red-400 bg-red-400/10 border border-red-400/20 rounded-xl px-3 py-2">
                      Submission failed. Please try again later.
                    </p>
                  )}

                  {/* Severity */}
                  <div>
                    <label className="block text-xs text-gray-400 mb-1.5" htmlFor="bb-severity">
                      Severity
                    </label>
                    <select
                      id="bb-severity"
                      value={severity}
                      onChange={(e) => setSeverity(e.target.value as Severity)}
                      className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm text-gray-200 focus:outline-none focus:border-[#00e5d0]/50 transition-colors"
                    >
                      <option value="critical">Critical</option>
                      <option value="high">High</option>
                      <option value="medium">Medium</option>
                      <option value="low">Low</option>
                    </select>
                  </div>

                  {/* Description */}
                  <div>
                    <label className="block text-xs text-gray-400 mb-1.5" htmlFor="bb-description">
                      Description <span className="text-gray-600">(required)</span>
                    </label>
                    <textarea
                      id="bb-description"
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      rows={5}
                      maxLength={5000}
                      required
                      placeholder="Describe the vulnerability, steps to reproduce, and potential impact…"
                      className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-[#00e5d0]/50 transition-colors resize-none"
                    />
                    <p className="text-right text-[10px] text-gray-600 mt-0.5">
                      {description.length}/5000
                    </p>
                  </div>

                  {/* Contact */}
                  <div>
                    <label className="block text-xs text-gray-400 mb-1.5" htmlFor="bb-contact">
                      Contact email <span className="text-gray-600">(optional)</span>
                    </label>
                    <input
                      id="bb-contact"
                      type="email"
                      value={contact}
                      onChange={(e) => setContact(e.target.value)}
                      placeholder="you@example.com"
                      className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-[#00e5d0]/50 transition-colors"
                    />
                  </div>

                  {/* Actions */}
                  <div className="flex gap-2 justify-end pt-1">
                    <button
                      type="button"
                      onClick={onClose}
                      className="px-4 py-2.5 rounded-xl text-sm text-gray-300 hover:text-white border border-white/10 hover:border-white/30 transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={!description.trim() || submitState === "submitting"}
                      className="px-5 py-2.5 rounded-xl text-sm font-bold bg-gradient-to-r from-[#00e5d0] to-[#00b8aa] text-black disabled:from-gray-700 disabled:to-gray-700 disabled:text-gray-500 transition-all shadow-lg shadow-[#00e5d0]/20 disabled:shadow-none"
                    >
                      {submitState === "submitting" ? "Sending…" : "Submit report"}
                    </button>
                  </div>
                </form>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
