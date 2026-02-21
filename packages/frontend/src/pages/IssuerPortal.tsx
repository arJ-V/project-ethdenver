import { useState } from "react";
import { useIssuerPortalData } from "../hooks/useIssuerPortalData";

export function IssuerPortal() {
  const [kwh, setKwh] = useState("12500");
  const [filter, setFilter] = useState<"all" | "lock" | "request" | "mint" | "settle" | "compliance-check">("all");
  const data = useIssuerPortalData();

  async function handleCreateRwa(event: React.FormEvent) {
    event.preventDefault();
    const numeric = Number(kwh);
    if (!Number.isFinite(numeric) || numeric <= 0) return;
    await data.submitRwa(numeric);
  }

  const filteredAudit = data.filterAudit(filter);

  return (
    <section className="page">
      <header className="page-header issuer-header">
        <div>
          <h1 className="page-title">Issuer Portal</h1>
          <p className="panel-subtitle">Manage institutional yield-bearing assets and compliance logs.</p>
        </div>
        <span className="compliance-badge">KYC/KYB VERIFIED (DEMO)</span>
      </header>

      {data.loadError ? <p className="status status-error">{data.loadError}</p> : null}

      <div className="issuer-top-grid">
        <section className="panel issuer-panel">
          <div className="panel-header">
            <h2 className="panel-title">Compliance Status</h2>
            <span className="status-pill status-positive">verified</span>
          </div>
          <div className="issuer-kv-list">
            <p>
              KYC/KYB <strong>Verified</strong>
            </p>
            <p>
              Last refresh <strong>{data.complianceRefreshAt ? new Date(data.complianceRefreshAt).toLocaleString() : "—"}</strong>
            </p>
            <p>
              Policy version <strong>Demo Policy v0.1</strong>
            </p>
          </div>
        </section>

        <section className="panel issuer-panel">
          <div className="panel-header">
            <h2 className="panel-title">Mint Pipeline</h2>
          </div>
          <div className="issuer-metrics-grid">
            <div>
              <span>requested</span>
              <strong>{data.pipelineCounts.requested}</strong>
            </div>
            <div>
              <span>processing</span>
              <strong>{data.pipelineCounts.processing}</strong>
            </div>
            <div>
              <span>minted</span>
              <strong>{data.pipelineCounts.minted}</strong>
            </div>
            <div>
              <span>failed</span>
              <strong>{data.pipelineCounts.failed}</strong>
            </div>
          </div>
        </section>

        <section className="panel issuer-panel">
          <div className="panel-header">
            <h2 className="panel-title">System Health</h2>
          </div>
          <div className="issuer-health-list">
            <p>
              <span className={data.tradingHealthy ? "health-dot health-dot-up" : "health-dot health-dot-down"} />
              Trading API
            </p>
            <p>
              <span className={data.rwaHealthy ? "health-dot health-dot-up" : "health-dot health-dot-down"} />
              RWA backend
            </p>
            <p>
              <span className={data.indexerError ? "health-dot health-dot-down" : "health-dot health-dot-up"} />
              Indexer {data.indexerError ? `(error: ${data.indexerError})` : "healthy"}
            </p>
          </div>
        </section>
      </div>

      <div className="issuer-grid">
        <div className="issuer-middle-grid">
          <section className="panel issuer-panel">
            <div className="panel-header">
              <h2 className="panel-title">Create RWA</h2>
              <span className="panel-subtitle">kWh-based issuance bootstrap</span>
            </div>
            <form className="issuer-rwa-form" onSubmit={handleCreateRwa}>
              <label>
                Current kWh output
                <input
                  type="number"
                  min={1}
                  step={1}
                  value={kwh}
                  onChange={(event) => setKwh(event.target.value)}
                  required
                />
              </label>
              <button type="submit" disabled={data.isSubmittingRwa}>
                {data.isSubmittingRwa ? "Creating..." : "Create RWA"}
              </button>
            </form>
            {data.isSubmittingRwa ? <p className="muted">Stage: {data.createRwaStage}</p> : null}
            {data.createRwaError ? <p className="status status-error">{data.createRwaError}</p> : null}
            {data.createRwaResult ? (
              <div className="issuer-kv-list">
                <p>
                  Created <strong>rwa_adi_id {data.createRwaResult.id}</strong>
                </p>
                <p>
                  ADI asset <strong>{data.createRwaResult.assetId}</strong> ({data.createRwaResult.status})
                </p>
                <p className="muted">Beneficiary: {data.createRwaResult.beneficiary}</p>
                <p className="muted">Mint tx: {data.createRwaResult.mintTxHash}</p>
                <p className="muted">Lock tx: {data.createRwaResult.lockTxHash}</p>
              </div>
            ) : null}
          </section>

          <section className="panel issuer-panel">
            <div className="panel-header">
              <h2 className="panel-title">Pending Mint Requests</h2>
            </div>
            <div className="audit-table-wrap">
              <table className="audit-table">
                <thead>
                  <tr>
                    <th>requestId</th>
                    <th>beneficiary</th>
                    <th>amount</th>
                    <th>requestedAt</th>
                    <th>status</th>
                    <th>txHash</th>
                  </tr>
                </thead>
                <tbody>
                  {data.pendingMintRows.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="muted">No pending requests.</td>
                    </tr>
                  ) : (
                    data.pendingMintRows.map((row) => (
                      <tr key={row.requestId}>
                        <td>{row.requestId}</td>
                        <td>{row.beneficiary}</td>
                        <td>{row.amount}</td>
                        <td>{row.requestedAt}</td>
                        <td>
                          <span className={row.status === "processing" ? "status-pill status-warning" : "status-pill"}>
                            {row.status}
                          </span>
                        </td>
                        <td>{row.txHash}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>

          <section className="panel issuer-panel">
            <div className="panel-header">
              <h2 className="panel-title">Failed / Needs Attention</h2>
            </div>
            <div className="issuer-attention-list">
              {data.needsAttention.failedOrders.length === 0 && data.needsAttention.staleRwas.length === 0 ? (
                <p className="muted">No active failures.</p>
              ) : null}
              {data.needsAttention.failedOrders.map((order) => (
                <div key={`failed-${order.optionId}`} className="issuer-attention-item">
                  <p>Order {order.optionId} failed ({order.statusLabel}).</p>
                  <button type="button" disabled>Retry</button>
                </div>
              ))}
              {data.needsAttention.staleRwas.map((rwa) => (
                <div key={`stale-${rwa.rwa_adi_id}`} className="issuer-attention-item">
                  <p>RWA {rwa.rwa_adi_id} telemetry is stale.</p>
                  <button type="button" disabled>Retry</button>
                </div>
              ))}
            </div>
          </section>
        </div>

        <section className="panel issuer-panel">
          <div className="panel-header">
            <div>
              <h2 className="panel-title">Compliance & Audit Log</h2>
              <p className="panel-subtitle">Filter by lock/request/mint/settle/compliance-check</p>
            </div>
          </div>
          <div className="issuer-filter-chips">
            {["all", "lock", "request", "mint", "settle", "compliance-check"].map((option) => (
              <button
                key={option}
                type="button"
                className={filter === option ? "issuer-filter-chip issuer-filter-chip-active" : "issuer-filter-chip"}
                onClick={() => setFilter(option as typeof filter)}
              >
                {option}
              </button>
            ))}
          </div>
          <div className="audit-table-wrap">
            <table className="audit-table">
              <thead>
                <tr>
                  <th>Timestamp</th>
                  <th>Action</th>
                  <th>Actor</th>
                  <th>Reference</th>
                  <th>TxHash</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {filteredAudit.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="muted">No audit events for selected filter.</td>
                  </tr>
                ) : (
                  filteredAudit.slice(0, 60).map((row) => (
                    <tr key={row.id}>
                      <td>{row.timestamp}</td>
                      <td>{row.action}</td>
                      <td>{row.actor}</td>
                      <td>{row.reference}</td>
                      <td>{row.txHash}</td>
                      <td>
                        <span className="status-pill">{row.status}</span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </section>
  );
}
