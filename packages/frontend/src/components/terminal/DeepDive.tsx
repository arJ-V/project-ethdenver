
"use client"

import { useState, useEffect, useCallback } from "react"
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Badge } from "@/components/ui/badge"
import { Asset } from "./AssetDiscovery"
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip } from "recharts"
import { Maximize2, RefreshCw, Layers, ShieldCheck, Zap, Loader2 } from "lucide-react"
import { getRwaData, getRwaLatest } from "@/lib/solartick-api"

function formatTs(ts: string): string {
  try {
    const d = new Date(ts)
    return d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })
  } catch {
    return ts
  }
}

interface DeepDiveProps {
  asset: Asset | null
}

export function DeepDive({ asset }: DeepDiveProps) {
  const [range, setRange] = useState<"1h" | "1d">("1h")
  const [rwaChartData, setRwaChartData] = useState<{ time: string; value: number }[]>([])
  const [rwaLatest, setRwaLatest] = useState<{ price_cents: number; kwh: number } | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchRwa = useCallback(async () => {
    if (!asset?.isRwa) return
    const rwaId = parseInt(asset.id, 10)
    if (Number.isNaN(rwaId)) return
    setLoading(true)
    setError(null)
    const now = new Date()
    const from = new Date(now.getTime() - (range === "1d" ? 24 : 1) * 60 * 60 * 1000)
    try {
      const [data, latest] = await Promise.all([
        getRwaData(rwaId, from.toISOString(), now.toISOString()),
        getRwaLatest(rwaId).catch(() => null),
      ])
      setRwaChartData(
        data.map((p) => ({ time: formatTs(p.ts), value: p.price_cents }))
      )
      setRwaLatest(latest ? { price_cents: latest.price_cents, kwh: latest.kwh } : null)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setRwaChartData([])
      setRwaLatest(null)
    } finally {
      setLoading(false)
    }
  }, [asset?.id, asset?.isRwa, range])

  useEffect(() => {
    fetchRwa()
    const interval = setInterval(fetchRwa, 5_000)
    return () => clearInterval(interval)
  }, [fetchRwa])

  if (!asset) {
    return (
      <div className="flex flex-col h-full items-center justify-center p-8 text-center">
        <Layers className="w-12 h-12 text-muted-foreground/50 mb-4" />
        <p className="text-muted-foreground font-medium">Select an RWA from the list</p>
        <p className="text-sm text-muted-foreground mt-1">Data is loaded from Postgres via SolarTick backend.</p>
      </div>
    )
  }

  const chartData = rwaChartData
  // Preview price: always use latest from Postgres (getRwaLatest → rwa_timeseries) when loaded
  const displayPrice = rwaLatest
    ? `$${(rwaLatest.price_cents / 100).toFixed(2)}`
    : asset.price === "—" || asset.price.includes("KWH")
      ? asset.price
      : asset.price.startsWith("$")
        ? asset.price
        : `$${asset.price}`
  const changePct =
    rwaChartData.length >= 2
      ? ((rwaChartData[rwaChartData.length - 1].value - rwaChartData[0].value) / rwaChartData[0].value) * 100
      : 0

  return (
    <div className="flex flex-col h-full space-y-4 p-4">
      <header className="flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <div className="p-3 bg-primary/20 rounded-lg">
            <Layers className="w-6 h-6 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-headline font-bold flex items-center gap-2">
              {asset.name} <span className="text-muted-foreground font-light">[{asset.symbol}]</span>
            </h1>
            <div className="flex items-center gap-2 mt-1">
              <Badge variant="outline" className="bg-secondary/50 text-[10px] uppercase tracking-widest">
                {asset.category}
              </Badge>
              <Badge variant="secondary" className="text-[10px]">Postgres RWA</Badge>
              <span className="text-xs text-muted-foreground flex items-center gap-1">
                <ShieldCheck className="w-3 h-3 text-accent" /> Live DB
              </span>
            </div>
          </div>
        </div>
        <div className="text-right">
          <div className="text-3xl font-headline font-bold tracking-tighter tabular-nums">
            {displayPrice}
          </div>
          <div className={`flex items-center justify-end text-sm font-medium ${changePct >= 0 ? "text-accent" : "text-destructive"}`}>
            <Zap className="w-3 h-3 mr-1 fill-current" /> {changePct >= 0 ? "+" : ""}{changePct.toFixed(2)}%
          </div>
        </div>
      </header>

      <Card className="flex-1 bg-card/40 border-muted/20 overflow-hidden backdrop-blur-md">
        <CardHeader className="flex flex-row items-center justify-between p-4 border-b border-muted/10">
          <Tabs value={range} onValueChange={(v) => setRange(v as "1h" | "1d")} className="w-auto">
            <TabsList className="bg-secondary/40">
              <TabsTrigger value="1h" className="text-xs px-2">1h</TabsTrigger>
              <TabsTrigger value="1d" className="text-xs px-2">1d</TabsTrigger>
            </TabsList>
          </Tabs>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => fetchRwa()}
              className="p-2 hover:bg-muted/40 rounded-md transition-colors"
            >
              <RefreshCw className={`w-4 h-4 text-muted-foreground ${loading ? "animate-spin" : ""}`} />
            </button>
            <button type="button" className="p-2 hover:bg-muted/40 rounded-md transition-colors">
              <Maximize2 className="w-4 h-4 text-muted-foreground" />
            </button>
          </div>
        </CardHeader>
        <CardContent className="p-0 h-[400px]">
          {error && (
            <div className="p-4 text-sm text-destructive">
              {error}
            </div>
          )}
          {loading && chartData.length === 0 ? (
            <div className="flex items-center justify-center h-full">
              <Loader2 className="w-8 h-8 text-primary animate-spin" />
            </div>
          ) : chartData.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-muted-foreground text-sm">
              <p>No time-series data yet</p>
              <p className="text-xs mt-1">Data comes from <code>rwa_timeseries</code> in Postgres.</p>
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData} margin={{ top: 20, right: 30, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorValue" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(255,255,255,0.05)" />
                <XAxis
                  dataKey="time"
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: "rgba(255,255,255,0.4)", fontSize: 10 }}
                />
                <YAxis hide domain={["dataMin - 100", "dataMax + 100"]} />
                <Tooltip
                  contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))" }}
                  itemStyle={{ color: "hsl(var(--primary))" }}
                  formatter={(value: number) => [`${(value / 100).toFixed(2)}¢`, "Price"]}
                />
                <Area
                  type="monotone"
                  dataKey="value"
                  stroke="hsl(var(--primary))"
                  strokeWidth={2}
                  fillOpacity={1}
                  fill="url(#colorValue)"
                />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-3 gap-4">
        {[
          { label: "Latest KWH", value: rwaLatest != null ? `${(rwaLatest.kwh / 1000).toFixed(1)} KWH` : "—", sub: "rwa_timeseries" },
          { label: "Price (cents)", value: rwaLatest != null ? String(rwaLatest.price_cents) : "—", sub: "Streamed" },
          { label: "Data source", value: "QuickNode & PG", sub: "SolarTick backend" },
        ].map((stat, i) => (
          <Card key={i} className="bg-sidebar/30 border-none p-4">
            <p className="text-[10px] text-muted-foreground uppercase font-headline font-bold tracking-widest">{stat.label}</p>
            <p className="text-lg font-headline font-bold mt-1 text-primary">{stat.value}</p>
            <p className="text-[10px] text-muted-foreground mt-0.5">{stat.sub}</p>
          </Card>
        ))}
      </div>
    </div>
  )
}
