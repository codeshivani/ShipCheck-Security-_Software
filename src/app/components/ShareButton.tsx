"use client";

import { useState } from "react";

export function ShareButton({ scanId }: { scanId: string }) {
  const [shareUrl, setShareUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

  async function share() {
    setError("");
    setCopied(false);
    setBusy(true);
    try {
      let url = shareUrl;
      if (!url) {
        const response = await fetch("/api/reports/share", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ scanId }),
        });
        const data: { token?: string; error?: string } = await response.json();
        if (!response.ok || !data.token) {
          throw new Error(data.error ?? "Unable to create a share link.");
        }
        url = `${window.location.origin}/reports/shared/${encodeURIComponent(data.token)}`;
        setShareUrl(url);
      }

      try {
        await navigator.clipboard.writeText(url);
        setCopied(true);
      } catch {
        setError("Share link created. Copy the URL from the field below.");
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to create a share link.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col items-start gap-2">
      <button
        type="button"
        onClick={share}
        disabled={busy}
        className="rounded-xl border border-sc-border bg-white px-5 py-3 text-sm font-semibold hover:bg-sc-surface-2 disabled:opacity-60"
      >
        {busy ? "Creating link…" : copied ? "Link copied" : shareUrl ? "Copy share link" : "Share report"}
      </button>
      {shareUrl && (
        <input
          aria-label="Read-only report share link"
          className="w-64 max-w-full rounded border border-sc-border px-2 py-1 text-xs"
          readOnly
          value={shareUrl}
          onFocus={event => event.currentTarget.select()}
        />
      )}
      {error && <p role="alert" className="max-w-64 text-xs text-sc-critical">{error}</p>}
    </div>
  );
}
