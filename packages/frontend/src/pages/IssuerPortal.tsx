import { ComplianceAuditPanel } from "../components/issuer/ComplianceAuditPanel";
import { HsmConnectionPanel } from "../components/issuer/HsmConnectionPanel";
import { MintVaultPanel } from "../components/issuer/MintVaultPanel";

export function IssuerPortal() {
  return (
    <section className="page">
      <header className="page-header issuer-header">
        <div>
          <h1 className="page-title">Issuer Portal</h1>
          <p className="panel-subtitle">Manage institutional yield-bearing assets and compliance logs.</p>
        </div>
        <span className="compliance-badge">KYC/KYB VERIFIED</span>
      </header>
      <div className="issuer-top-grid">
        <HsmConnectionPanel />
        <MintVaultPanel />
      </div>
      <div className="issuer-grid">
        <ComplianceAuditPanel />
      </div>
    </section>
  );
}
