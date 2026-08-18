import { explorerTxUrl, shortAddr } from "../lib/constants";

export type TxPhase = "pending" | "submitting" | "confirmed" | "failed";

export interface TxState {
  phase: TxPhase;
  hash?: string;
  message?: string;
}

const LABELS: Record<TxPhase, string> = {
  pending: "Pending",
  submitting: "Submitting",
  confirmed: "Confirmed",
  failed: "Failed",
};

export function TxStatus({ tx }: { tx: TxState | null }) {
  if (!tx) {
    return (
      <div className="card">
        <h2>Transaction status</h2>
        <p className="muted">No transaction yet.</p>
      </div>
    );
  }

  return (
    <div className="card">
      <h2>Transaction status</h2>
      <span className={`badge ${tx.phase}`}>{LABELS[tx.phase]}</span>

      {tx.hash && (
        <p style={{ marginTop: 12 }}>
          <span className="muted">Tx: </span>
          <a
            className="mono"
            href={explorerTxUrl(tx.hash)}
            target="_blank"
            rel="noreferrer"
          >
            {shortAddr(tx.hash)} ↗
          </a>
        </p>
      )}

      {tx.phase === "confirmed" && (
        <p className="muted" style={{ color: "var(--green)" }}>
          Confirmed on-chain — the payment now appears in the activity feed.
        </p>
      )}

      {tx.phase === "failed" && (
        <p style={{ color: "var(--red)" }}>{tx.message ?? "Transaction failed."}</p>
      )}
    </div>
  );
}
