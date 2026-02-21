import type { TimelineEvent } from "../../lib/types";
import { CheckCircle2, Link2, Server } from "lucide-react";

interface ImmutableLedgerPanelProps {
  events: TimelineEvent[];
  error: string | null;
}

function getStatusClass(status: string | undefined) {
  if (status === "executed" || status === "created") return "status-pill status-positive";
  if (status === "pending") return "status-pill status-warning";
  if (status === "failed" || status === "liquidated") return "status-pill status-negative";
  return "status-pill";
}

export function ImmutableLedgerPanel({ events, error }: ImmutableLedgerPanelProps) {
  const feed = events.length ? [...events, ...events] : [];

  return (
    <section className="ledger-strip">
      <div className="ledger-strip-start">
        <Server size={14} />
        <span>Immutable Stream</span>
      </div>
      <div className="ledger-strip-track">
        {error ? <p className="status status-error">{error}</p> : null}
        {!error && events.length === 0 ? <p className="muted">Waiting for network receipts...</p> : null}
        {!error && events.length > 0 ? (
          <div className="ledger-scroll">
            {feed.map((event, index) => (
              <div key={`${event.optionId}-${event.txHash}-${index}`} className="ledger-inline-item">
                <span>[{event.timestamp ? new Date(event.timestamp).toLocaleTimeString() : "now"}]</span>
                <span>{event.source === "oracle" ? "[oracle]" : "[trade]"}</span>
                <strong>{event.type}</strong>
                <span className={getStatusClass(event.status)}>
                  <CheckCircle2 size={10} />
                  {event.status ?? "tracked"}
                </span>
                <span>
                  <Link2 size={10} />
                  {event.txHash ? `${event.txHash.slice(0, 10)}...` : "pending"}
                </span>
              </div>
            ))}
          </div>
        ) : null}
      </div>
      <div className="ledger-strip-end">
        <span className="ledger-live-dot" />
        <span>Network Live</span>
      </div>
    </section>
  );
}
