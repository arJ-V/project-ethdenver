import { useState } from "react";
import { AssetDiscoveryPanel } from "../components/trader/AssetDiscoveryPanel";
import { AICopilotPanel } from "../components/trader/AICopilotPanel";
import { DeepDiveTelemetryPanel } from "../components/trader/DeepDiveTelemetryPanel";
import { ImmutableLedgerPanel } from "../components/trader/ImmutableLedgerPanel";
import { TradeOptionsModal } from "../components/trader/TradeOptionsModal";
import { rwaAssets } from "../data/assets";
import { useLedgerFeed } from "../hooks/useLedgerFeed";
import { useOrderLifecycle } from "../hooks/useOrderLifecycle";
import type { RwaAsset } from "../data/assets";

export function TraderTerminal() {
  const [selectedAsset, setSelectedAsset] = useState<RwaAsset>(rwaAssets[0]);
  const [activeOptionId, setActiveOptionId] = useState<string | null>(null);
  const [tradeModalOpen, setTradeModalOpen] = useState(false);
  const lifecycle = useOrderLifecycle(activeOptionId);
  const ledger = useLedgerFeed();

  return (
    <section className="terminal-page">
      <div className="trader-grid">
        <AssetDiscoveryPanel
          assets={rwaAssets}
          selectedAssetId={selectedAsset.id}
          onSelectAsset={setSelectedAsset}
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
