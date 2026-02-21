
"use client"

import { useState } from "react"
import { AssetDiscovery, Asset } from "@/components/terminal/AssetDiscovery"
import { DeepDive } from "@/components/terminal/DeepDive"
import { AICopilot } from "@/components/terminal/AICopilot"
import { ImmutableLedger } from "@/components/terminal/ImmutableLedger"

const DEFAULT_ASSET: Asset = {
  id: "1",
  symbol: "CTX",
  name: "Conduit Index",
  price: "2,450.21",
  change: 2.4,
  volume: "1.2B",
  category: "DeFi"
}

export default function TerminalPage() {
  const [selectedAsset, setSelectedAsset] = useState<Asset>(DEFAULT_ASSET)

  return (
    <div className="flex flex-col h-screen">
      <div className="flex flex-1 overflow-hidden">
        {/* Left Panel: Asset Discovery */}
        <div className="w-80 border-r border-muted/10 overflow-hidden shrink-0">
          <AssetDiscovery 
            selectedId={selectedAsset.id} 
            onSelect={setSelectedAsset} 
          />
        </div>

        {/* Center Panel: Deep Dive & Telemetry */}
        <div className="flex-1 overflow-auto bg-background/50">
          <DeepDive asset={selectedAsset} />
        </div>

        {/* Right Panel: AI Copilot */}
        <div className="w-80 border-l border-muted/10 overflow-hidden shrink-0">
          <AICopilot />
        </div>
      </div>

      {/* Bottom Panel: Immutable Ledger */}
      <div className="h-10 shrink-0">
        <ImmutableLedger />
      </div>
    </div>
  )
}
