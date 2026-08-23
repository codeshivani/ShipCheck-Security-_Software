"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type Factor = { id: string; friendly_name?: string | null; status: string };

export function MfaSettings() {
  const [factor, setFactor] = useState<Factor | null>(null);
  const [qr, setQr] = useState("");
  const [secret, setSecret] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function load() {
    const { data, error } = await createClient().auth.mfa.listFactors();
    if (!error) setFactor(data?.totp?.find(item => item.status === "verified") ?? null);
  }
  useEffect(() => { void load(); }, []);

  async function enroll() {
    setBusy(true); setError(""); setMessage("");
    const { data, error } = await createClient().auth.mfa.enroll({ factorType: "totp", friendlyName: "ShipCheck authenticator" });
    setBusy(false);
    if (error || !data?.totp) { setError("Unable to start MFA enrollment."); return; }
    setFactor({ id: data.id, friendly_name: data.friendly_name, status: data.status });
    setQr(data.totp.qr_code); setSecret(data.totp.secret); setCode("");
  }

  async function verify() {
    if (!factor) return; setBusy(true); setError("");
    const supabase = createClient();
    const challenge = await supabase.auth.mfa.challenge({ factorId: factor.id });
    if (challenge.error) { setBusy(false); setError("Unable to start MFA verification."); return; }
    const result = await supabase.auth.mfa.verify({ factorId: factor.id, challengeId: challenge.data.id, code: code.trim() });
    setBusy(false);
    if (result.error) { setError("Invalid authenticator code."); return; }
    setQr(""); setSecret(""); setCode(""); setMessage("MFA is enabled for this account."); await load();
  }

  async function unenroll() {
    if (!factor || !window.confirm("Disable MFA for this account?")) return;
    setBusy(true); setError("");
    const { error } = await createClient().auth.mfa.unenroll({ factorId: factor.id });
    setBusy(false);
    if (error) { setError("MFA can only be disabled from a verified session."); return; }
    setFactor(null); setMessage("MFA disabled.");
  }

  return <section className="mt-6 rounded-2xl border border-sc-border bg-sc-surface p-6">
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div><h2 className="text-xl font-bold">Account security</h2><p className="text-sm text-sc-muted">Use an authenticator app as a second factor.</p></div>{factor?.status === "verified" ? <button disabled={busy} onClick={unenroll} className="rounded-lg border border-sc-border px-4 py-2 text-sm">Disable MFA</button> : null}</div>
    {!factor && <button disabled={busy} onClick={enroll} className="mt-5 rounded-lg bg-sc-pass px-4 py-2 text-sm font-semibold text-[#07110e]">{busy ? "Starting…" : "Enable MFA"}</button>}
    {qr && <div className="mt-5 grid gap-5 sm:grid-cols-[180px_1fr]"><div className="rounded-xl bg-white p-3"><img src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(qr)}`} alt="MFA enrollment QR code" className="h-auto w-full"/></div><div><p className="text-sm font-semibold">Scan this QR code</p><p className="mt-2 text-sm text-sc-muted">Then enter the 6-digit code from your authenticator app.</p><p className="mt-3 break-all rounded-lg bg-sc-surface-2 p-3 text-xs">{secret}</p><input inputMode="numeric" maxLength={6} value={code} onChange={e=>setCode(e.target.value.replace(/\D/g,'').slice(0,6))} placeholder="000000" className="mt-3 w-full rounded-lg border border-sc-border bg-white px-4 py-3"/><button disabled={busy || code.length !== 6} onClick={verify} className="mt-3 rounded-lg bg-sc-pass px-4 py-2 text-sm font-semibold text-[#07110e] disabled:opacity-50">Verify and enable</button></div></div>}
    {message && <p className="mt-4 text-sm text-sc-pass">{message}</p>}{error && <p className="mt-4 text-sm text-sc-critical">{error}</p>}
  </section>;
}
