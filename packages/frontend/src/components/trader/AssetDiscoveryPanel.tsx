import type { RwaAsset } from "../../data/assets";
import { Activity } from "lucide-react";

interface AssetDiscoveryPanelProps {
  assets: RwaAsset[];
  selectedAssetId: string;
  onSelectAsset: (asset: RwaAsset) => void;
}

export function AssetDiscoveryPanel({ assets, selectedAssetId, onSelectAsset }: AssetDiscoveryPanelProps) {
  return (
    <section className="panel trader-panel asset-panel">
      <div className="panel-header">
        <h2 className="panel-title">Asset Discovery</h2>
        <Activity size={14} className="panel-icon-pulse" />
      </div>
      <input className="asset-search" placeholder="Search assets..." />
      <div className="asset-list">
        {assets.map((asset) => {
          const selected = asset.id === selectedAssetId;
          return (
            <button
              key={asset.id}
              type="button"
              className={selected ? "asset-item asset-item-active" : "asset-item"}
              onClick={() => onSelectAsset(asset)}
            >
              <div>
                <p className="asset-symbol">{asset.symbol}</p>
                <p className="asset-name">{asset.name}</p>
              </div>
              <div className="asset-price-wrap">
                <p className="asset-price">${asset.price.toLocaleString()}</p>
                <p className={asset.changePct >= 0 ? "asset-change asset-change-up" : "asset-change asset-change-down"}>
                  {asset.changePct >= 0 ? "+" : ""}
                  {asset.changePct.toFixed(2)}%
                </p>
              </div>
            </button>
          );
        })}
      </div>
    </section>
  );
}
