import { useMemo, useState } from "react";
import { AssetDiscoveryPanel } from "../components/trader/AssetDiscoveryPanel";
import { AICopilotPanel } from "../components/trader/AICopilotPanel";
import { DeepDiveTelemetryPanel } from "../components/trader/DeepDiveTelemetryPanel";
import { ImmutableLedgerPanel } from "../components/trader/ImmutableLedgerPanel";
import { TradeOptionsModal } from "../components/trader/TradeOptionsModal";
import { useLedgerFeed } from "../hooks/useLedgerFeed";
import { useOrderLifecycle } from "../hooks/useOrderLifecycle";
import { useRwaAssets } from "../hooks/useRwaAssets";
import type { RwaAsset } from "../data/assets";

export function TraderTerminal() {
  const { assets, error: assetsError } = useRwaAssets();
  const [selectedAssetId, setSelectedAssetId] = useState<string | null>(null);
  const [activeOptionId, setActiveOptionId] = useState<string | null>(null);
  const [tradeModalOpen, setTradeModalOpen] = useState(false);
  const lifecycle = useOrderLifecycle(activeOptionId);
  const ledger = useLedgerFeed();
  const selectedAsset = useMemo<RwaAsset | null>(() => {
    if (!assets.length) return null;
    if (!selectedAssetId) return assets[0];
    return assets.find((asset) => asset.id === selectedAssetId) ?? assets[0];
  }, [assets, selectedAssetId]);

  if (!selectedAsset) {
    return (
      <section className="terminal-page">
        <section className="panel trader-panel">
          <p className="muted">{assetsError ? "RWA assets unavailable." : "Waiting for first RWA from issuer flow..."}</p>
          {assetsError ? <p className="status status-error">{assetsError}</p> : null}
        </section>
      </section>
    );
  }

  return (
    <section className="terminal-page">
      <div className="trader-grid">
        <AssetDiscoveryPanel
          assets={assets}
          selectedAssetId={selectedAsset.id}
          onSelectAsset={(asset) => setSelectedAssetId(asset.id)}
        />
        <DeepDiveTelemetryPanel
          asset={selectedAsset}
          onOpenTradeOptions={() => setTradeModalOpen(true)}
          statusLabel={lifecycle.order?.statusLabel}
        />
        <div className="trader-right-stack">
          <AICopilotPanel />
        </div>
      </div>
      {assetsError ? <p className="status status-error">Live RWA refresh issue: {assetsError}</p> : null}
      <ImmutableLedgerPanel events={ledger.events} error={ledger.error} />
      <TradeOptionsModal
        open={tradeModalOpen}
        asset={selectedAsset}
        order={lifecycle.order}
        lifecycleLoading={lifecycle.isLoading}
        lifecycleError={lifecycle.error}
        onClose={() => setTradeModalOpen(false)}
        onSubmitted={(optionId) => {
          setActiveOptionId(optionId);
        }}
      />
    </section>
  );
}
