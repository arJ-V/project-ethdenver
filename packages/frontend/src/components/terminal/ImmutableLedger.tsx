
"use client"

import { useEffect, useState } from "react"
import { CheckCircle2, Link2, Server } from "lucide-react"
import { getRwaFeed, type RwaFeedEntry } from "@/lib/solartick-api"

function formatTime(ts: string): string {
  try {
    return new Date(ts).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", second: "2-digit" })
  } catch {
    return ts
  }
}

function entryToDisplay(e: RwaFeedEntry) {
  return {
    id: String(e.id),
    time: formatTime(e.ts),
    type: "YIELD",
    status: "ORACLE",
    hash: e.tx_hash ? `${e.tx_hash.slice(0, 6)}...${e.tx_hash.slice(-4)}` : "—",
    price_cents: e.price_cents,
    kwh: e.kwh,
  }
}

export function ImmutableLedger() {
  const [entries, setEntries] = useState<ReturnType<typeof entryToDisplay>[]>([])

  useEffect(() => {
    let cancelled = false
    getRwaFeed(40)
      .then((feed) => {
        if (!cancelled) setEntries(feed.map(entryToDisplay))
      })
      .catch(() => {
        if (!cancelled) setEntries([])
      })
    return () => {
      cancelled = true
    }
  }, [])

  const scrollContent = entries.length > 0 ? [...entries, ...entries] : []

  return (
    <div className="h-full bg-sidebar flex items-center border-t border-muted/10 overflow-hidden relative scrolling-ledger">
      <div className="flex items-center px-4 border-r border-muted/10 h-full bg-sidebar z-10 space-x-2">
        <Server className="w-4 h-4 text-primary" />
        <span className="text-[10px] font-headline font-bold text-muted-foreground uppercase tracking-widest whitespace-nowrap">
          Immutable Stream
        </span>
      </div>
      <div className="flex-1 overflow-hidden relative flex items-center">
        {scrollContent.length === 0 ? (
          <span className="text-[10px] text-muted-foreground px-8">No oracle updates yet (from <code>rwa_oracle_updates</code>)</span>
        ) : (
        <div className="flex items-center space-x-8 whitespace-nowrap px-8 animate-ledger-scroll">
          {scrollContent.map((entry, idx) => (
            <div key={`${entry.id}-${idx}`} className="flex items-center space-x-2 text-[10px] font-mono">
              <span className="text-muted-foreground">[{entry.time}]</span>
              <span className="text-primary font-bold uppercase">{entry.type}</span>
              <div className="flex items-center gap-1 text-accent font-bold">
                <CheckCircle2 className="w-3 h-3" />
                {entry.status}
              </div>
              {"price_cents" in entry && entry.price_cents != null && (
                <span className="text-muted-foreground">{(entry.price_cents / 100).toFixed(2)}¢</span>
              )}
              <span className="text-muted-foreground/60 flex items-center gap-1">
                <Link2 className="w-3 h-3" />
                {entry.hash}
              </span>
            </div>
          ))}
        </div>
        )}
      </div>
      <div className="px-4 border-l border-muted/10 h-full flex items-center bg-sidebar z-10">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-accent animate-pulse" />
          <span className="text-[10px] font-headline font-medium text-muted-foreground">Network Live</span>
        </div>
      </div>
    </div>
  )
}
