
"use client"

import { useState } from "react"
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Slider } from "@/components/ui/slider"
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table"
import { ShieldCheck, Cpu, HardDrive, History, FileText, CheckCircle, ArrowRightCircle, Plus } from "lucide-react"

export default function IssuerPortal() {
  const [mintAmount, setMintAmount] = useState([50])
  const [hsmStatus, setHsmStatus] = useState("linked")

  return (
    <div className="max-w-6xl mx-auto p-8 space-y-8 pb-12">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-headline font-bold">Issuer Portal</h1>
          <p className="text-muted-foreground text-sm mt-1">Manage institutional yield-bearing assets and compliance logs.</p>
        </div>
        <Badge variant="outline" className="px-4 py-1.5 bg-accent/10 border-accent/20 text-accent font-headline font-bold text-xs uppercase tracking-widest gap-2">
          <CheckCircle className="w-4 h-4" /> KYC/KYB VERIFIED
        </Badge>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* HSM Integration */}
        <Card className="bg-card/40 border-muted/10 col-span-1">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-headline flex items-center justify-between">
              HSM Connection
              <div className="flex items-center gap-1.5">
                <div className="w-1.5 h-1.5 rounded-full bg-accent animate-ping"></div>
                <span className="text-[10px] text-accent uppercase font-bold tracking-tighter">Live Ping</span>
              </div>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-4 p-4 bg-sidebar rounded-lg border border-muted/10">
              <HardDrive className="w-8 h-8 text-primary" />
              <div>
                <p className="text-xs font-bold font-headline">VaultNode-Alpha-09</p>
                <p className="text-[10px] text-muted-foreground">ID: 8842-CTX-990</p>
              </div>
            </div>
            <div className="space-y-1">
              <div className="flex justify-between text-[10px] uppercase font-bold tracking-widest text-muted-foreground">
                <span>Entropy Score</span>
                <span className="text-accent">99.8%</span>
              </div>
              <div className="h-1 bg-muted/20 rounded-full overflow-hidden">
                <div className="h-full bg-accent w-[99.8%]"></div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Minting Vault */}
        <Card className="bg-card/40 border-muted/10 col-span-2">
          <CardHeader>
            <div className="flex justify-between items-center">
              <div>
                <CardTitle className="text-xl font-headline">Minting Vault</CardTitle>
                <CardDescription className="text-[10px]">Create new Yield Token (YT) issuance rounds.</CardDescription>
              </div>
              <Plus className="w-5 h-5 text-muted-foreground" />
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid grid-cols-2 gap-8">
              <div className="space-y-4">
                <div className="flex justify-between items-end">
                  <span className="text-xs font-medium text-muted-foreground uppercase tracking-widest">Issuance Volume</span>
                  <span className="text-2xl font-headline font-bold text-primary">${mintAmount[0]}M</span>
                </div>
                <Slider 
                  value={mintAmount} 
                  onValueChange={setMintAmount} 
                  max={250} 
                  step={1} 
                />
                <div className="flex justify-between text-[10px] text-muted-foreground font-mono">
                  <span>$0M</span>
                  <span>$250M LIMIT</span>
                </div>
              </div>
              <div className="flex flex-col justify-center border-l border-muted/10 pl-8 space-y-4">
                <div className="flex justify-between">
                  <span className="text-xs text-muted-foreground">Projected APY</span>
                  <span className="text-sm font-bold font-headline text-accent">5.42%</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-xs text-muted-foreground">Protocol Fee</span>
                  <span className="text-sm font-bold font-headline">0.05%</span>
                </div>
                <button className="w-full py-2 bg-primary text-primary-foreground rounded-md text-xs font-bold font-headline flex items-center justify-center gap-2 mt-2 hover:bg-primary/90 transition-all">
                  INITIALIZE MINT <ArrowRightCircle className="w-4 h-4" />
                </button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Compliance & Audit Logs */}
      <Card className="bg-card/40 border-muted/10">
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-xl font-headline flex items-center gap-2">
              <History className="w-5 h-5 text-muted-foreground" /> Compliance & Audit Logs
            </CardTitle>
            <CardDescription className="text-xs">Immutable trail of all issuance and management actions.</CardDescription>
          </div>
          <button className="flex items-center gap-2 text-xs font-bold font-headline hover:text-primary transition-all">
            <FileText className="w-4 h-4" /> EXPORT REPORT
          </button>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader className="bg-sidebar/50">
              <TableRow className="border-muted/10">
                <TableHead className="text-[10px] font-headline uppercase tracking-widest">Timestamp</TableHead>
                <TableHead className="text-[10px] font-headline uppercase tracking-widest">Action</TableHead>
                <TableHead className="text-[10px] font-headline uppercase tracking-widest">Operator</TableHead>
                <TableHead className="text-[10px] font-headline uppercase tracking-widest">Network Hash</TableHead>
                <TableHead className="text-[10px] font-headline uppercase tracking-widest text-right">Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {[
                { time: "2024-05-24 09:15:22", action: "Vault Rebalance", user: "Admin-01", hash: "0x8fa...ee21", status: "VERIFIED" },
                { time: "2024-05-24 08:32:01", action: "Batch Mint", user: "AutoBot-Beta", hash: "0x11b...4a02", status: "VERIFIED" },
                { time: "2024-05-23 22:11:54", action: "KYC Refresh", user: "System", hash: "0xcc2...99d1", status: "VERIFIED" },
                { time: "2024-05-23 18:05:40", action: "Entropy Check", user: "HSM-V09", hash: "0x551...22b8", status: "VERIFIED" },
                { time: "2024-05-23 14:22:11", action: "Whitelist Add", user: "Admin-02", hash: "0x992...31f2", status: "VERIFIED" },
              ].map((log, i) => (
                <TableRow key={i} className="border-muted/10 hover:bg-sidebar/30">
                  <TableCell className="text-[10px] font-mono text-muted-foreground">{log.time}</TableCell>
                  <TableCell className="text-xs font-headline font-bold">{log.action}</TableCell>
                  <TableCell className="text-xs">{log.user}</TableCell>
                  <TableCell className="text-[10px] font-mono text-muted-foreground">{log.hash}</TableCell>
                  <TableCell className="text-right">
                    <span className="text-[10px] font-bold text-accent bg-accent/10 px-2 py-0.5 rounded border border-accent/20">
                      {log.status}
                    </span>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}
