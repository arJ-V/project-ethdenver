
"use client"

import { useEffect, useState } from "react"
import { CheckCircle2, Link2, Server } from "lucide-react"

type LedgerEntry = {
  id: string
  hash: string
  status: string
  time: string
  type: string
}

const INITIAL_ENTRIES: LedgerEntry[] = [
  { id: "1", hash: "0x4a...2f1b", status: "CONFIRMED", time: "12:45:01", type: "MINT" },
  { id: "2", hash: "0x88...f9d2", status: "VERIFIED", time: "12:45:12", type: "SETTLE" },
  { id: "3", hash: "0x12...a6c5", status: "CONFIRMED", time: "12:45:24", type: "TRADE" },
  { id: "4", hash: "0xbb...3311", status: "AUDITED", time: "12:45:30", type: "YIELD" },
  { id: "5", hash: "0x4a...2f1b", status: "CONFIRMED", time: "12:45:01", type: "MINT" },
  { id: "6", hash: "0x88...f9d2", status: "VERIFIED", time: "12:45:12", type: "SETTLE" },
  { id: "7", hash: "0x12...a6c5", status: "CONFIRMED", time: "12:45:24", type: "TRADE" },
  { id: "8", hash: "0xbb...3311", status: "AUDITED", time: "12:45:30", type: "YIELD" },
]

export function ImmutableLedger() {
  return (
    <div className="h-full bg-sidebar flex items-center border-t border-muted/10 overflow-hidden relative scrolling-ledger">
      <div className="flex items-center px-4 border-r border-muted/10 h-full bg-sidebar z-10 space-x-2">
        <Server className="w-4 h-4 text-primary" />
        <span className="text-[10px] font-headline font-bold text-muted-foreground uppercase tracking-widest whitespace-nowrap">Immutable Stream</span>
      </div>
      <div className="flex-1 overflow-hidden relative">
        <div className="flex items-center space-x-8 whitespace-nowrap px-8 animate-ledger-scroll">
          {[...INITIAL_ENTRIES, ...INITIAL_ENTRIES].map((entry, idx) => (
            <div key={idx} className="flex items-center space-x-2 text-[10px] font-mono">
              <span className="text-muted-foreground">[{entry.time}]</span>
              <span className="text-primary font-bold uppercase">{entry.type}</span>
              <div className="flex items-center gap-1 text-accent font-bold">
                <CheckCircle2 className="w-3 h-3" />
                {entry.status}
              </div>
              <span className="text-muted-foreground/60 flex items-center gap-1">
                <Link2 className="w-3 h-3" />
                {entry.hash}
              </span>
            </div>
          ))}
        </div>
      </div>
      <div className="px-4 border-l border-muted/10 h-full flex items-center bg-sidebar z-10">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-accent animate-pulse"></div>
          <span className="text-[10px] font-headline font-medium text-muted-foreground">Network Live</span>
        </div>
      </div>
    </div>
  )
}
