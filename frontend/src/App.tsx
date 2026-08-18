import { Component, useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { WalletConnect } from "./components/WalletConnect";
import { PaymentForm, type PaymentInput } from "./components/PaymentForm";
import { TxStatus, type TxState } from "./components/TxStatus";
import { ActivityFeed } from "./components/ActivityFeed";
import { ToastContainer, type Toast } from "./components/Toast";
import {
  connectWallet,
  disconnectWallet,
  getConnectedAddress,
  onWalletStateChanged,
  signTransaction,
} from "./lib/wallet";
import { ContractCallError, recordPayment, waitForTransaction } from "./lib/contract";
import { mapErrorCodeToMessage } from "./lib/errors";
import { explorerContractUrl } from "./lib/constants";

class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  render() {
    if (this.state.error) {
      return (
        <div className="card">
          <h2>Something went wrong</h2>
          <p style={{ color: "var(--red)" }}>{this.state.error.message}</p>
          <button onClick={() => this.setState({ error: null })}>Try again</button>
        </div>
      );
    }
    return this.props.children;
  }
}

export default function App() {
  const [address, setAddress] = useState<string | undefined>();
  const [tx, setTx] = useState<TxState | null>(null);
  const [busy, setBusy] = useState(false);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [feedRefresh, setFeedRefresh] = useState(0);
  const toastId = useRef(0);

  // Restore + track the connected wallet.
  useEffect(() => {
    getConnectedAddress()
      .then(setAddress)
      .catch(() => {});
    return onWalletStateChanged(setAddress);
  }, []);

  // Auto-dismiss toasts.
  useEffect(() => {
    if (toasts.length === 0) return;
    const timer = setTimeout(() => setToasts((prev) => prev.slice(1)), 6000);
    return () => clearTimeout(timer);
  }, [toasts]);

  const pushToast = useCallback((kind: Toast["kind"], message: string) => {
    const id = ++toastId.current;
    setToasts((prev) => [...prev, { id, kind, message }]);
  }, []);

  async function handleConnect() {
    try {
      const a = await connectWallet();
      setAddress(a);
    } catch {
      pushToast("error", "Wallet connection was cancelled or failed.");
    }
  }

  function handleDisconnect() {
    disconnectWallet();
    setAddress(undefined);
    setTx(null);
  }

  async function handleSubmitPayment(input: PaymentInput) {
    if (!address) return;
    setBusy(true);
    setTx({ phase: "submitting" });
    try {
      const { hash } = await recordPayment({
        from: address,
        to: input.to,
        amountStroops: input.amountStroops,
        memo: input.memo,
        signTransaction: (xdr) => signTransaction(xdr, address),
      });

      setTx({ phase: "submitting", hash });
      pushToast("success", "Payment submitted — awaiting confirmation…");

      const { outcome } = await waitForTransaction(hash);
      if (outcome === "success") {
        setTx({ phase: "confirmed", hash });
        pushToast("success", "Payment confirmed on-chain.");
        setFeedRefresh((n) => n + 1);
      } else {
        setTx({ phase: "failed", hash });
        pushToast("error", "Payment failed on-chain.");
      }
    } catch (err) {
      // Map contract errors (and unknown failures) to a friendly message.
      const message =
        err instanceof ContractCallError
          ? mapErrorCodeToMessage(err.code)
          : (err as Error).message;
      setTx({ phase: "failed", message });
      pushToast("error", message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <ErrorBoundary>
      <header style={{ marginBottom: 24 }}>
        <h1>Multi-Wallet Payment Tracker</h1>
        <p className="muted">
          Send payments from any connected wallet and watch them settle in real
          time. Contract:{" "}
          <a
            className="mono"
            href={explorerContractUrl()}
            target="_blank"
            rel="noreferrer"
          >
            view on explorer ↗
          </a>
        </p>
      </header>

      <div className="grid">
        <WalletConnect
          address={address}
          onConnect={handleConnect}
          onDisconnect={handleDisconnect}
        />
        <PaymentForm address={address} busy={busy} onSubmit={handleSubmitPayment} />
        <TxStatus tx={tx} />
        <ActivityFeed refreshKey={feedRefresh} />
      </div>

      <ToastContainer
        toasts={toasts}
        onDismiss={(id) => setToasts((prev) => prev.filter((t) => t.id !== id))}
      />
    </ErrorBoundary>
  );
}
