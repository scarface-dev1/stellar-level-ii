import { useEffect, useState } from "react";
import { fetchPaymentEvents, stroopsToXlm, type FeedEvent } from "../lib/contract";
import { explorerTxUrl, shortAddr } from "../lib/constants";

const POLL_INTERVAL_MS = 5000;

export function ActivityFeed({ refreshKey }: { refreshKey: number }) {
  const [events, setEvents] = useState<FeedEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const next = await fetchPaymentEvents();
        if (!cancelled) {
          setEvents(next);
          setError(null);
        }
      } catch (err) {
        if (!cancelled) setError((err as Error).message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    const id = setInterval(load, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [refreshKey]);

  return (
    <div className="card">
      <h2>Live activity feed</h2>
      <p className="muted">
        Payments pulled from contract events, updating without a refresh.
      </p>

      {loading && <p className="muted">Loading…</p>}
      {error && <p style={{ color: "var(--red)" }}>{error}</p>}
      {!loading && !error && events.length === 0 && (
        <p className="muted">No payments recorded yet.</p>
      )}

      {events.map((e) => (
        <div key={e.id} className="feed-item">
          <div>
            <span className="mono">{shortAddr(e.from)}</span>
            <span className="arrow"> → </span>
            <span className="mono">{shortAddr(e.to)}</span>{" "}
            <strong>{stroopsToXlm(e.amount)} XLM</strong>
          </div>
          <div className="muted mono">
            payment #{e.paymentId} ·{" "}
            {new Date(Number(e.timestamp) * 1000).toLocaleString()} ·{" "}
            <a href={explorerTxUrl(e.txHash)} target="_blank" rel="noreferrer">
              tx ↗
            </a>
          </div>
        </div>
      ))}
    </div>
  );
}
