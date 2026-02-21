
"use client"

import { useState, useEffect, useCallback } from "react"
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Search, TrendingUp, TrendingDown, Activity, Loader2 } from "lucide-react"
import { cn } from "@/lib/utils"
import { listRwas, getPrice, checkBackendHealth, type RwaListItem } from "@/lib/solartick-api"

export type Asset = {
  id: string
  symbol: string
  name: string
  price: string
  change: number
  volume: string
  category: "DeFi" | "Real Estate" | "Energy" | "Tech"
  isRwa?: boolean
}

async function fetchRwaAssets(): Promise<Asset[]> {
  const rwas = await listRwas()
  const withPrices = await Promise.all(
    rwas.map(async (r: RwaListItem) => {
      let priceStr = "—"
      try {
        const p = await getPrice(r.rwa_adi_id)
        if (p.asset_price_cents != null)
          priceStr = (p.asset_price_cents / 100).toFixed(2)
      } catch {
        if (r.latest_kwh != null) priceStr = `${(r.latest_kwh / 1000).toFixed(1)} KWH`
      }
      return {
        id: String(r.rwa_adi_id),
        symbol: `RWA-${r.rwa_adi_id}`,
        name: `RWA Asset ${r.rwa_adi_id}`,
        price: priceStr,
        change: 0,
        volume: "—",
        category: "Energy" as const,
        isRwa: true,
      }
    })
  )
  return withPrices
}

interface AssetDiscoveryProps {
  selectedId: string
  onSelect: (asset: Asset) => void
}

export function AssetDiscovery({ selectedId, onSelect }: AssetDiscoveryProps) {
  const [rwaAssets, setRwaAssets] = useState<Asset[]>([])
  const [loading, setLoading] = useState(true)
  const [dataSource, setDataSource] = useState<"live" | "offline" | "checking">("checking")

  const refresh = useCallback(() => {
    Promise.all([checkBackendHealth(), fetchRwaAssets()])
      .then(([health, list]) => {
        setRwaAssets(health.ok ? list : [])
        setDataSource(health.ok ? "live" : "offline")
      })
      .catch(() => {
        setRwaAssets([])
        setDataSource("offline")
      })
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    refresh()
    const interval = setInterval(refresh, 5_000)
    return () => clearInterval(interval)
  }, [refresh])

  // When live data loads and current selection isn't in the list, select first RWA
  useEffect(() => {
    if (rwaAssets.length > 0 && (selectedId === "" || !rwaAssets.some((a) => a.id === selectedId))) {
      onSelect(rwaAssets[0])
    }
  }, [rwaAssets, selectedId, onSelect])

  return (
    <Card className="h-full border-none rounded-none bg-sidebar/50 backdrop-blur-sm">
      <CardHeader className="p-4 space-y-4">
        <div className="flex items-center justify-between">
          <CardTitle className="text-xl font-headline tracking-tight">Asset Discovery</CardTitle>
          <div className="flex items-center gap-2">
            {dataSource === "live" && (
              <span className="text-[10px] font-medium text-accent uppercase tracking-wider" title="Data from Postgres (SolarTick backend)">
                Live DB
              </span>
            )}
            {dataSource === "offline" && (
              <span className="text-[10px] font-medium text-destructive uppercase tracking-wider" title="Backend unreachable">
                Offline
              </span>
            )}
            {loading ? <Loader2 className="w-5 h-5 text-primary animate-spin" /> : <Activity className="w-5 h-5 text-primary animate-pulse" />}
          </div>
        </div>
        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input 
            placeholder="Search assets..." 
            className="pl-9 bg-secondary/50 border-none focus-visible:ring-1 focus-visible:ring-primary/50"
          />
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <ScrollArea className="h-[calc(100vh-280px)]">
          <div className="px-2 pb-4 space-y-1">
            {dataSource === "offline" && !loading && (
              <div className="p-4 text-center text-sm text-muted-foreground">
                Backend unreachable. Start SolarTick (Postgres + backend) and set <code className="text-xs">NEXT_PUBLIC_SOLARTICK_API_URL=http://localhost:8000</code>.
              </div>
            )}
            {dataSource === "live" && rwaAssets.length === 0 && !loading && (
              <div className="p-4 text-center text-sm text-muted-foreground">
                No RWAs in database. Create one: <code className="text-xs">POST /api/rwa</code> with <code className="text-xs">{"{ \"kwh\": 50000 }"}</code>
              </div>
            )}
            {rwaAssets.map((asset) => (
              <button
                key={asset.id}
                onClick={() => onSelect(asset)}
                className={cn(
                  "w-full flex items-center justify-between p-3 rounded-md transition-all text-left group",
                  selectedId === asset.id
                    ? "bg-primary/10 border-l-2 border-primary shadow-inner"
                    : "hover:bg-muted/30"
                )}
              >
                <div className="flex flex-col">
                  <span className="font-headline text-sm font-bold tracking-wider">{asset.symbol}</span>
                  <span className="text-xs text-muted-foreground">{asset.name}</span>
                </div>
                <div className="text-right flex flex-col items-end">
                  <span className="font-headline text-sm tabular-nums">
                    {asset.price.includes("KWH") || asset.price === "—" ? asset.price : `$${asset.price}`}
                  </span>
                  <div className={cn(
                    "flex items-center text-[10px] font-medium",
                    asset.change >= 0 ? "text-accent" : "text-destructive"
                  )}>
                    {asset.change >= 0 ? <TrendingUp className="w-3 h-3 mr-1" /> : <TrendingDown className="w-3 h-3 mr-1" />}
                    {Math.abs(asset.change)}%
                  </div>
                </div>
              </button>
            ))}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  )
}
