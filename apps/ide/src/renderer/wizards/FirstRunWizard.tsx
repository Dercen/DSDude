/**
 * The first-run wizard (PLAN.md 6 WS6): checks the computer with `dsdude doctor` (fixes named in each line), sets up
 * melonDS (C4 ensureInstalled: the bundled or downloaded 1.1 build, SHA-256 checked), offers the optional DeSmuME
 * profile, then hands over to Learn. Shown until it has been finished once (settings.firstRunDone).
 */
import { useEffect, useState } from "react";
import { useActions, useIde } from "../ide-context.tsx";
import { ipc, parseIpcError } from "../ipc.ts";

interface Check {
  name: string;
  ok: boolean;
  detail: string;
  status?: "ok" | "warn" | "fail" | "info";
}

type Setup = { state: "idle" | "busy" } | { state: "done"; exe: string } | { state: "failed"; message: string };

const ICON = { ok: "✔", warn: "⚠", fail: "✖", info: "ℹ" } as const;

export function FirstRunWizard() {
  const open = useIde((s) => s.firstRun);
  const actions = useActions();
  const [checks, setChecks] = useState<Check[] | null>(null);
  const [checkError, setCheckError] = useState<string | null>(null);
  const [melon, setMelon] = useState<Setup>({ state: "idle" });
  const [desmume, setDesmume] = useState<Setup>({ state: "idle" });

  const runChecks = () => {
    setChecks(null);
    setCheckError(null);
    ipc.invoke("doctor.run", {}).then(
      (r) => setChecks(r.checks),
      (err: unknown) => setCheckError(parseIpcError(err).message),
    );
  };
  // biome-ignore lint/correctness/useExhaustiveDependencies: run the checks each time the wizard opens.
  useEffect(() => {
    if (open) runChecks();
  }, [open]);

  if (!open) return null;
  const install = async (kind: "melonds" | "desmume", setState: (s: Setup) => void) => {
    setState({ state: "busy" });
    try {
      const { exe } = await ipc.invoke("emulator.install", { kind });
      setState({ state: "done", exe });
    } catch (err) {
      setState({ state: "failed", message: parseIpcError(err).message });
    }
  };
  const failures = checks?.filter((c) => !c.ok).length ?? 0;

  const setupRow = (label: string, testId: string, st: Setup, run: () => void, optional: boolean) => (
    <div className="fr-setup">
      <span>
        {label}
        {optional ? <span className="fr-optional"> (optional)</span> : null}
      </span>
      {st.state === "done" ? (
        <span className="fr-ok" data-testid={`${testId}-done`} title={st.exe}>
          {ICON.ok} Ready
        </span>
      ) : (
        <button type="button" data-testid={testId} disabled={st.state === "busy"} onClick={run}>
          {st.state === "busy" ? "Setting up…" : st.state === "failed" ? "Try again" : "Set up"}
        </button>
      )}
      {st.state === "failed" ? <p className="field-error">{st.message}</p> : null}
    </div>
  );

  return (
    <div className="overlay">
      <div
        className="dialog first-run"
        role="dialog"
        aria-modal="true"
        aria-labelledby="fr-title"
        data-testid="first-run"
      >
        <h2 id="fr-title">Welcome to DSDude</h2>
        <p>A quick check that everything needed to make and play DS games is here.</p>

        <h3>Your computer</h3>
        {checkError ? <p className="field-error">The check could not run: {checkError}</p> : null}
        {checks === null && !checkError ? <p>Checking…</p> : null}
        {checks ? (
          <ul className="fr-checks" data-testid="fr-checks">
            {checks.map((c) => {
              const st = c.status ?? (c.ok ? "ok" : "fail");
              return (
                <li key={c.name} className={`fr-check fr-${st}`}>
                  <span className="fr-icon">{ICON[st]}</span>
                  <span className="fr-name">{c.name}</span>
                  <span className="fr-detail">{c.detail}</span>
                </li>
              );
            })}
          </ul>
        ) : null}
        {checks ? (
          <p className={failures > 0 ? "field-warning" : "field-hint"}>
            {failures > 0
              ? `${failures} thing${failures === 1 ? "" : "s"} to fix: each line says how. Games will not build until then.`
              : "Everything needed is here."}{" "}
            <button type="button" className="link" onClick={runChecks}>
              Check again
            </button>
          </p>
        ) : null}

        <h3>Emulator</h3>
        <p className="field-hint">The emulator plays your game on this computer, like a DS.</p>
        {setupRow("melonDS", "fr-melonds", melon, () => void install("melonds", setMelon), false)}
        {setupRow("DeSmuME", "fr-desmume", desmume, () => void install("desmume", setDesmume), true)}

        <div className="dialog-buttons">
          <button type="button" className="primary" data-testid="fr-done" onClick={() => void actions.finishFirstRun()}>
            {melon.state === "done" ? "Start making games" : "Skip for now"}
          </button>
        </div>
      </div>
    </div>
  );
}
