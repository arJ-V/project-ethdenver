const mockAuditRows = [
  { ts: "2026-02-20 09:15:23", action: "Vault Rebalance", operator: "Admin-01", hash: "0x8f4a...ec21", status: "verified" },
  { ts: "2026-02-20 03:32:01", action: "Batch Mint", operator: "AutoBot-Beta", hash: "0x11b...a8b2", status: "verified" },
  { ts: "2026-02-19 22:11:54", action: "KYC Refresh", operator: "System", hash: "0xccc...99d1", status: "pending" },
  { ts: "2026-02-19 18:05:40", action: "Entropy Check", operator: "HSM-V09", hash: "0x551...2288", status: "verified" },
  { ts: "2026-02-19 14:22:11", action: "Whitelist Add", operator: "Admin-02", hash: "0x992...31f2", status: "verified" },
];

function statusClass(status: string) {
  if (status === "verified") return "status-pill status-positive";
  if (status === "pending") return "status-pill status-warning";
  return "status-pill status-negative";
}

export function ComplianceAuditPanel() {
  return (
    <section className="panel issuer-panel">
      <div className="panel-header">
        <div>
          <h2 className="panel-title">Compliance & Audit Logs</h2>
          <p className="panel-subtitle">Immutable trail of issuance and management actions.</p>
        </div>
        <button type="button" className="audit-export-button">Export Report</button>
      </div>

      <div className="audit-table-wrap">
        <table className="audit-table">
          <thead>
            <tr>
              <th>Timestamp</th>
              <th>Action</th>
              <th>Operator</th>
              <th>Network Hash</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {mockAuditRows.map((row) => (
              <tr key={`${row.ts}-${row.action}`}>
                <td>{row.ts}</td>
                <td>{row.action}</td>
                <td>{row.operator}</td>
                <td>{row.hash}</td>
                <td>
                  <span className={statusClass(row.status)}>{row.status}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
