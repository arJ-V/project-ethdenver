import { HardDrive } from "lucide-react";

export function HsmConnectionPanel() {
  return (
    <section className="panel issuer-panel hsm-panel">
      <div className="panel-header">
        <h2 className="panel-title">HSM Connection</h2>
        <span className="hsm-live">Live Ping</span>
      </div>
      <div className="hsm-card">
        <HardDrive size={20} />
        <div>
          <p>VaultNode-Alpha-09</p>
          <span>ID: 8842-CTX-990</span>
        </div>
      </div>
      <div className="hsm-entropy">
        <div>
          <span>Entropy Score</span>
          <strong>99.8%</strong>
        </div>
        <div className="hsm-entropy-track">
          <div />
        </div>
      </div>
    </section>
  );
}
