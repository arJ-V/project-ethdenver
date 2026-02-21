
"use client"

import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Search, TrendingUp, TrendingDown, Activity } from "lucide-react"
import { cn } from "@/lib/utils"

export type Asset = {
  id: string
  symbol: string
  name: string
  price: string
  change: number
  volume: string
  category: "DeFi" | "Real Estate" | "Energy" | "Tech"
}

const MOCK_ASSETS: Asset[] = [
  { id: "1", symbol: "CTX", name: "Conduit Index", price: "2,450.21", change: 2.4, volume: "1.2B", category: "DeFi" },
  { id: "2", symbol: "SOLA", name: "Solaris Yield", price: "84.50", change: -1.2, volume: "450M", category: "Energy" },
  { id: "3", symbol: "REIT", name: "Urban Prime", price: "1,120.00", change: 0.5, volume: "89M", category: "Real Estate" },
  { id: "4", symbol: "NEO", name: "Neo Genesis", price: "45.12", change: 5.8, volume: "2.1B", category: "Tech" },
  { id: "5", symbol: "LQD", name: "Liquid Flow", price: "12.05", change: -0.8, volume: "300M", category: "DeFi" },
  { id: "6", symbol: "WND", name: "Wind Harvest", price: "67.90", change: 1.1, volume: "120M", category: "Energy" },
  { id: "7", symbol: "META", name: "Meta Grid", price: "234.55", change: 3.2, volume: "560M", category: "Tech" },
]

interface AssetDiscoveryProps {
  selectedId: string
  onSelect: (asset: Asset) => void
}

export function AssetDiscovery({ selectedId, onSelect }: AssetDiscoveryProps) {
  return (
    <Card className="h-full border-none rounded-none bg-sidebar/50 backdrop-blur-sm">
      <CardHeader className="p-4 space-y-4">
        <div className="flex items-center justify-between">
          <CardTitle className="text-xl font-headline tracking-tight">Asset Discovery</CardTitle>
          <Activity className="w-5 h-5 text-primary animate-pulse" />
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
            {MOCK_ASSETS.map((asset) => (
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
                  <span className="font-headline text-sm tabular-nums">${asset.price}</span>
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
