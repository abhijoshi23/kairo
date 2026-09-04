"use client";

import { useState } from "react";
import ThemeToggle from "./ThemeToggle";

export default function LoginForm({ unconfigured }: { unconfigured: boolean }) {
  const [passphrase, setPassphrase] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!passphrase || busy) return;

    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ passphrase }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        setError(body?.error ?? "Sign in failed.");
        setPassphrase("");
        return;
      }
      // Full reload so middleware re-evaluates with the new cookie.
      window.location.href = "/";
    } catch {
      setError("Could not reach the server.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="relative flex min-h-dvh items-center justify-center px-4">
      <div className="absolute right-4 top-4">
        <ThemeToggle />
      </div>
      <div className="w-full max-w-xs">
        <div className="mb-7 flex flex-col items-center gap-2.5 text-center">
          <span className="kairo-mark flex h-11 w-11 items-center justify-center rounded-full text-lg font-bold text-accent-fg shadow-md">
            K
          </span>
          <div>
            <h1 className="text-base font-semibold">Kairo</h1>
            <p className="mt-0.5 text-[0.8rem] text-muted">This assistant is private.</p>
          </div>
        </div>

        {unconfigured ? (
          <div className="rounded-xl border border-yellow-500/35 bg-yellow-500/10 px-3.5 py-3 text-[0.82rem] text-yellow-600 dark:text-yellow-400">
            <p className="font-medium">Not configured</p>
            <p className="mt-1 leading-relaxed">
              Set <code>APP_PASSPHRASE</code> in this deployment&apos;s environment
              variables, then redeploy.
            </p>
          </div>
        ) : (
          <form onSubmit={submit} className="flex flex-col gap-2.5">
            <input
              type="password"
              value={passphrase}
              onChange={(e) => setPassphrase(e.target.value)}
              placeholder="Passphrase"
              aria-label="Passphrase"
              autoFocus
              autoComplete="current-password"
              className="w-full rounded-xl border border-line bg-surface px-3.5 py-2.5 text-[0.9rem] outline-none transition-colors placeholder:text-muted focus:border-accent/60"
            />
            <button
              type="submit"
              disabled={!passphrase || busy}
              className="w-full rounded-xl bg-accent px-3.5 py-2.5 text-[0.9rem] font-medium text-accent-fg transition-all hover:opacity-90 active:scale-[0.98] disabled:opacity-35 disabled:active:scale-100"
            >
              {busy ? "Checking…" : "Continue"}
            </button>
            {error && (
              <p role="alert" className="mt-1 text-center text-[0.8rem] text-red-500">
                {error}
              </p>
            )}
          </form>
        )}
      </div>
    </div>
  );
}
