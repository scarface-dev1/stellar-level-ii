import { useState } from "react";
import { StrKey } from "@stellar/stellar-sdk";
import { xlmToStroops } from "../lib/contract";

export interface PaymentInput {
  to: string;
  amountStroops: bigint;
  memo: string;
}

export function PaymentForm({
  address,
  busy,
  onSubmit,
}: {
  address: string | undefined;
  busy: boolean;
  onSubmit: (input: PaymentInput) => void;
}) {
  const [to, setTo] = useState("");
  const [amount, setAmount] = useState("");
  const [memo, setMemo] = useState("");
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!StrKey.isValidEd25519PublicKey(to) && !StrKey.isValidContract(to)) {
      setError("Enter a valid Stellar address (starts with G or C).");
      return;
    }

    let amountStroops: bigint;
    try {
      amountStroops = xlmToStroops(amount);
    } catch (err) {
      setError((err as Error).message);
      return;
    }

    if (amountStroops <= 0n) {
      setError("Amount must be greater than zero.");
      return;
    }

    onSubmit({ to, amountStroops, memo });
  }

  if (!address) {
    return (
      <div className="card">
        <h2>Send payment</h2>
        <p className="muted">Connect a wallet to send a payment.</p>
      </div>
    );
  }

  return (
    <div className="card">
      <h2>Send payment</h2>
      <form onSubmit={handleSubmit}>
        <div className="field">
          <label>From</label>
          <input className="mono" value={address} readOnly disabled />
        </div>
        <div className="field">
          <label>Recipient address</label>
          <input
            className="mono"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            placeholder="G… or C…"
            spellCheck={false}
          />
        </div>
        <div className="field">
          <label>Amount (XLM)</label>
          <input
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0.00"
            inputMode="decimal"
          />
        </div>
        <div className="field">
          <label>Memo (optional)</label>
          <input
            value={memo}
            onChange={(e) => setMemo(e.target.value)}
            placeholder="What's this payment for?"
          />
        </div>
        {error && <p style={{ color: "var(--red)" }}>{error}</p>}
        <button type="submit" className="primary" disabled={busy}>
          {busy ? "Sending…" : "Send payment"}
        </button>
      </form>
    </div>
  );
}
