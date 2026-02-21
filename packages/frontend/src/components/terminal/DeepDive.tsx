
"use client"

import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { Badge } from "@/components/ui/badge"
import { Asset } from "./AssetDiscovery"
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, AreaChart, Area } from "recharts"
import { Maximize2, RefreshCw, Layers, ShieldCheck, Zap } from "lucide-react"

const CHART_DATA = [
  { time: '09:00', value: 2400 },
  { time: '10:00', value: 2350 },
  { time: '11:00', value: 2420 },
  { time: '12:00', value: 2390 },
  { time: '13:00', value: 2480 },
  { time: '14:00', value: 2510 },
  { time: '15:00', value: 2450 },
  { time: '16:00', value: 2490 },
]

interface DeepDiveProps {
  asset: Asset
}

export function DeepDive({ asset }: DeepDiveProps) {
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
              <Badge variant="outline" className="bg-secondary/50 text-[10px] uppercase tracking-widest">{asset.category}</Badge>
              <span className="text-xs text-muted-foreground flex items-center gap-1">
                <ShieldCheck className="w-3 h-3 text-accent" /> Verified Node Consensus
              </span>
            </div>
          </div>
        </div>
        <div className="text-right">
          <div className="text-3xl font-headline font-bold tracking-tighter tabular-nums">${asset.price}</div>
          <div className="flex items-center justify-end text-accent text-sm font-medium">
            <Zap className="w-3 h-3 mr-1 fill-accent" /> +{asset.change}% ($12.45)
          </div>
        </div>
      </header>

      <Card className="flex-1 bg-card/40 border-muted/20 overflow-hidden backdrop-blur-md">
        <CardHeader className="flex flex-row items-center justify-between p-4 border-b border-muted/10">
          <Tabs defaultValue="1h" className="w-auto">
            <TabsList className="bg-secondary/40">
              <TabsTrigger value="1m" className="text-xs px-2">1m</TabsTrigger>
              <TabsTrigger value="5m" className="text-xs px-2">5m</TabsTrigger>
              <TabsTrigger value="1h" className="text-xs px-2">1h</TabsTrigger>
              <TabsTrigger value="1d" className="text-xs px-2">1d</TabsTrigger>
            </TabsList>
          </Tabs>
          <div className="flex items-center gap-2">
            <button className="p-2 hover:bg-muted/40 rounded-md transition-colors"><RefreshCw className="w-4 h-4 text-muted-foreground" /></button>
            <button className="p-2 hover:bg-muted/40 rounded-md transition-colors"><Maximize2 className="w-4 h-4 text-muted-foreground" /></button>
          </div>
        </CardHeader>
        <CardContent className="p-0 h-[400px]">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={CHART_DATA} margin={{ top: 20, right: 30, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="colorValue" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3}/>
                  <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0}/>
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(255,255,255,0.05)" />
              <XAxis 
                dataKey="time" 
                axisLine={false} 
                tickLine={false} 
                tick={{fill: 'rgba(255,255,255,0.4)', fontSize: 10}} 
              />
              <YAxis 
                hide 
                domain={['dataMin - 100', 'dataMax + 100']}
              />
              <Tooltip 
                contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))' }}
                itemStyle={{ color: 'hsl(var(--primary))' }}
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
        </CardContent>
      </Card>

      <div className="grid grid-cols-3 gap-4">
        {[
          { label: "Network Telemetry", value: "98.4ms Latency", sub: "Global Average" },
          { label: "Immutable Volume", value: asset.volume, sub: "Total Locked Value" },
          { label: "Node Health", value: "99.9% Uptime", sub: "342 Active Clusters" }
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
