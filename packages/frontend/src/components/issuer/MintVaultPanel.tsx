import { useMemo, useState } from "react";

const VOLUME_LIMIT = 250_000_000;

export function MintVaultPanel() {
  const [volume, setVolume] = useState(50_000_000);

  const projectedApy = useMemo(() => {
    const ratio = volume / VOLUME_LIMIT;
    return (5 + ratio * 0.8).toFixed(2);
  }, [volume]);

  return (
    <section className="panel issuer-panel">
      <div className="panel-header">
        <div>
          <h2 className="panel-title">Minting Vault</h2>
          <p className="panel-subtitle">Create new Yield Token (YT) issuance rounds.</p>
        </div>
        <button type="button" className="mint-plus-button">+</button>
      </div>

      <div className="mint-grid">
        <div>
          <p className="mint-label">Issuance Volume</p>
          <p className="mint-volume">${Math.round(volume / 1_000_000)}M</p>
          <input
            type="range"
            min={1_000_000}
            max={VOLUME_LIMIT}
            step={1_000_000}
            value={volume}
            onChange={(event) => setVolume(Number(event.target.value))}
          />
          <div className="mint-scale">
            <span>$0M</span>
            <span>$250M Limit</span>
          </div>
        </div>
        <div className="mint-stats">
          <p>
            Projected APY <strong>{projectedApy}%</strong>
          </p>
          <p>
            Protocol Fee <strong>0.05%</strong>
          </p>
          <button type="button" className="mint-init-button">Initialize Mint</button>
        </div>
      </div>
    </section>
  );
}
