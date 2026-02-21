"use client"

import { useState, useEffect, useCallback } from "react"
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { HardDrive, History, FileText, CheckCircle, Plus, AlertCircle } from "lucide-react"
import { createRwa, bootstrapRwaById, listRwas, getConfig, type RwaListItem } from "@/lib/solartick-api"
import { getOrders, getTimeline, type Order } from "@/lib/trading-api"

const POLL_MS = 12_000
const RWA_POLL_MS = 5_000
const STALE_RWA_MINUTES = 15
const MAX_TIMELINE_ENRICH = 8

function shortAddr(addr: string) {
  if (!addr || addr.length < 12) return addr
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`
}

function shortHash(hash: string) {
  if (!hash || hash.length < 14) return hash
  return `${hash.slice(0, 6)}…${hash.slice(-4)}`
}

export default function IssuerPortal() {
  const [kwhInput, setKwhInput] = useState("")
  const [createLoading, setCreateLoading] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)
  const [createdId, setCreatedId] = useState<number | null>(null)
  const [adiVaultAddress, setAdiVaultAddress] = useState<string | null>(null)
  const [orders, setOrders] = useState<Order[]>([])
  const [ordersLoading, setOrdersLoading] = useState(true)
  const [orderDetails, setOrderDetails] = useState<Record<string, { requestedAt: string; txHash: string }>>({})
  const [rwas, setRwas] = useState<RwaListItem[]>([])
  const [rwasLoading, setRwasLoading] = useState(false)
  const [bootstrapMode, setBootstrapMode] = useState(false)
  const [lastBootstrapResult, setLastBootstrapResult] = useState<{
    rwa_adi_id: number;
    asset_id?: number;
    mint_tx_hash: string;
    lock_tx_hash: string;
    beneficiary: string;
  } | null>(null)
  const [bootstrapLoadingId, setBootstrapLoadingId] = useState<number | null>(null)

  const fetchOrders = useCallback(async () => {
    try {
      const res = await getOrders()
      setOrders(res.orders)
      const toEnrich = res.orders.slice(0, MAX_TIMELINE_ENRICH)
      const next: Record<string, { requestedAt: string; txHash: string }> = {}
      await Promise.all(
        toEnrich.map(async (o) => {
          try {
            const t = await getTimeline(o.optionId)
            const first = t.events[0]
            const last = t.events.length > 0 ? t.events[t.events.length - 1] : null
            next[o.optionId] = {
              requestedAt: first?.ts ? new Date(first.ts).toLocaleString() : "—",
              txHash: last?.txHash ?? first?.txHash ?? "—",
            }
          } catch {
            next[o.optionId] = { requestedAt: "—", txHash: "—" }
          }
        })
      )
      setOrderDetails((prev) => ({ ...prev, ...next }))
    } catch {
      setOrders([])
    } finally {
      setOrdersLoading(false)
    }
  }, [])

  const fetchRwas = useCallback(async () => {
    setRwasLoading(true)
    try {
      const list = await listRwas()
      setRwas(list)
    } catch {
      setRwas([])
    } finally {
      setRwasLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchOrders()
    const t = setInterval(fetchOrders, POLL_MS)
    return () => clearInterval(t)
  }, [fetchOrders])

  useEffect(() => {
    const onFocus = () => fetchOrders()
    window.addEventListener("focus", onFocus)
    return () => window.removeEventListener("focus", onFocus)
  }, [fetchOrders])

  useEffect(() => {
    fetchRwas()
    const t = setInterval(fetchRwas, RWA_POLL_MS)
    return () => clearInterval(t)
  }, [fetchRwas])

  useEffect(() => {
    getConfig()
      .then((c) => setAdiVaultAddress(c.adi_vault_address ?? null))
      .catch(() => setAdiVaultAddress(null))
  }, [])

  const pendingOrders = orders.filter(
    (o) => o.statusLabel !== "failed" && o.statusLabel !== "liquidated"
  )
  const failedOrders = orders.filter(
    (o) => o.statusLabel === "failed" || o.statusLabel === "liquidated"
  )
  const staleThreshold = Date.now() - STALE_RWA_MINUTES * 60 * 1000
  const staleRwas = rwas.filter((r) => {
    if (!r.latest_ts) return true
    return new Date(r.latest_ts).getTime() < staleThreshold
  })

  const rwaCreationInProgress = rwas.some(
    (r) =>
      r.bootstrap_status === "created" ||
      (r.bootstrap_status === "locked" && (!r.hedera_mint_status || r.hedera_mint_status === "pending"))
  )

  const handleBootstrapExisting = async (rwaId: number) => {
    setCreateError(null)
    setBootstrapLoadingId(rwaId)
    try {
      await bootstrapRwaById(rwaId)
      await fetchRwas()
    } catch (err) {
      const raw = err instanceof Error ? err.message : String(err)
      try {
        const parsed = JSON.parse(raw)
        setCreateError(parsed.detail ?? raw)
      } catch {
        setCreateError(raw)
      }
    } finally {
      setBootstrapLoadingId(null)
    }
  }

  const handleCreateRwa = async (e: React.FormEvent) => {
    e.preventDefault()
    setCreateError(null)
    setCreatedId(null)
    setLastBootstrapResult(null)
    const kwh = Number(kwhInput)
    if (!Number.isFinite(kwh) || kwh <= 0) {
      setCreateError("kWh must be a positive number")
      return
    }
    setCreateLoading(true)
    try {
      const res = await createRwa(kwh, { bootstrap: bootstrapMode })
      setCreatedId(res.rwa_adi_id)
      if (res.mint_tx_hash != null && res.lock_tx_hash != null) {
        setLastBootstrapResult({
          rwa_adi_id: res.rwa_adi_id,
          asset_id: res.asset_id,
          mint_tx_hash: res.mint_tx_hash,
          lock_tx_hash: res.lock_tx_hash,
          beneficiary: res.beneficiary ?? "",
        })
      }
      setKwhInput("")
      await fetchRwas()
    } catch (err) {
      const raw = err instanceof Error ? err.message : String(err)
      try {
        const parsed = JSON.parse(raw)
        setCreateError(parsed.detail ?? raw)
      } catch {
        setCreateError(raw)
      }
    } finally {
      setCreateLoading(false)
    }
  }

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
              <div className="min-w-0 flex-1">
                <p className="text-xs font-bold font-headline">ADI Vault</p>
                <p
                  className="text-[10px] font-mono text-muted-foreground truncate cursor-default"
                  title={adiVaultAddress ?? "Not configured"}
                >
                  {adiVaultAddress ? `${shortAddr(adiVaultAddress)}` : "—"}
                </p>
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

        {/* Create RWA */}
        <Card className="bg-card/40 border-muted/10 col-span-2">
          <CardHeader>
            <div className="flex justify-between items-center">
              <div>
                <CardTitle className="text-xl font-headline">Create RWA</CardTitle>
                <CardDescription className="text-[10px]">Create in Postgres only, or Create & Bootstrap on ADI (mint + lock) to get asset ID and tx hashes.</CardDescription>
              </div>
              <Plus className="w-5 h-5 text-muted-foreground" />
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <form onSubmit={handleCreateRwa} className="space-y-4">
              <div className="flex flex-col sm:flex-row gap-4 items-end">
                <div className="flex-1 space-y-2">
                  <label className="text-xs font-medium text-muted-foreground uppercase tracking-widest">kWh</label>
                  <Input
                    type="number"
                    min={0.01}
                    step="any"
                    placeholder="e.g. 1000"
                    value={kwhInput}
                    onChange={(e) => setKwhInput(e.target.value)}
                    disabled={createLoading || rwaCreationInProgress}
                    className="font-mono"
                  />
                </div>
                <Button type="submit" disabled={createLoading || rwaCreationInProgress}>
                  {createLoading ? (bootstrapMode ? "Creating & bootstrapping…" : "Creating…") : bootstrapMode ? "Create & Bootstrap" : "Create RWA"}
                </Button>
              </div>
              {rwaCreationInProgress && (
                <p className="text-sm text-amber-600 dark:text-amber-500">
                  One RWA is currently in creation (Postgres, ADI bootstrap, or Hedera ySOLAR mint). Wait for it to finish before creating another.
                </p>
              )}
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input
                  type="checkbox"
                  checked={bootstrapMode}
                  onChange={(e) => setBootstrapMode(e.target.checked)}
                  disabled={rwaCreationInProgress}
                  className="rounded border-muted"
                />
                Create & Bootstrap on ADI (mint + lock; requires backend ADI config)
              </label>
            </form>
            {createError && (
              <p className="text-sm text-destructive">{createError}</p>
            )}
            {createdId !== null && !lastBootstrapResult && (
              <p className="text-sm text-accent font-medium">Created RWA: ID {createdId}</p>
            )}
            {lastBootstrapResult && (
              <div className="rounded-lg border border-accent/20 bg-accent/5 p-4 space-y-2 text-sm">
                <p className="font-headline font-bold text-accent">Created & bootstrapped RWA: ID {lastBootstrapResult.rwa_adi_id}</p>
                <p className="text-muted-foreground">ADI Asset ID: <span className="font-mono text-foreground">{lastBootstrapResult.asset_id ?? "—"}</span></p>
                <p className="text-muted-foreground">Mint tx: <span className="font-mono text-foreground" title={lastBootstrapResult.mint_tx_hash}>{shortHash(lastBootstrapResult.mint_tx_hash)}</span></p>
                <p className="text-muted-foreground">Lock tx: <span className="font-mono text-foreground" title={lastBootstrapResult.lock_tx_hash}>{shortHash(lastBootstrapResult.lock_tx_hash)}</span></p>
                <p className="text-muted-foreground">Beneficiary: <span className="font-mono text-foreground" title={lastBootstrapResult.beneficiary}>{shortAddr(lastBootstrapResult.beneficiary)}</span></p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* RWA Minting Pipeline (single card; contract push data: ADI mint/lock tx, Hedera ySOLAR tx) */}
      <Card className="bg-card/40 border-muted/10">
        <CardHeader>
          <CardTitle className="text-xl font-headline">RWA Minting Pipeline</CardTitle>
          <CardDescription className="text-xs">Created → ADI mint+lock (contract push) → Hedera ySOLAR mint (relayer). Use &quot;Bootstrap&quot; for RWAs stuck at created. Refreshes every 5s.</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {rwasLoading && rwas.length === 0 ? (
            <p className="p-6 text-sm text-muted-foreground">Loading RWAs…</p>
          ) : rwas.length === 0 ? (
            <p className="p-6 text-sm text-muted-foreground">No RWAs yet. Create one above.</p>
          ) : (
            <Table>
              <TableHeader className="bg-sidebar/50">
                <TableRow className="border-muted/10">
                  <TableHead className="text-[10px] font-headline uppercase tracking-widest">RWA ID</TableHead>
                  <TableHead className="text-[10px] font-headline uppercase tracking-widest">Status</TableHead>
                  <TableHead className="text-[10px] font-headline uppercase tracking-widest">ADI Asset ID</TableHead>
                  <TableHead className="text-[10px] font-headline uppercase tracking-widest">ADI Mint Tx</TableHead>
                  <TableHead className="text-[10px] font-headline uppercase tracking-widest">ADI Lock Tx</TableHead>
                  <TableHead className="text-[10px] font-headline uppercase tracking-widest">Hedera ySOLAR</TableHead>
                  <TableHead className="text-[10px] font-headline uppercase tracking-widest">Beneficiary</TableHead>
                  <TableHead className="text-[10px] font-headline uppercase tracking-widest w-24">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rwas.map((r) => (
                  <TableRow key={r.rwa_adi_id} className="border-muted/10 hover:bg-sidebar/30">
                    <TableCell className="text-[10px] font-mono">{r.rwa_adi_id}</TableCell>
                    <TableCell>
                      <Badge variant={r.bootstrap_status === "locked" ? "default" : r.bootstrap_status === "failed" ? "destructive" : "outline"} className="text-[10px]">
                        {r.bootstrap_status ?? "created"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-[10px] font-mono">{r.asset_id ?? "—"}</TableCell>
                    <TableCell className="text-[10px] font-mono text-muted-foreground" title={r.mint_tx_hash ?? undefined}>
                      {r.mint_tx_hash ? shortHash(r.mint_tx_hash) : "—"}
                    </TableCell>
                    <TableCell className="text-[10px] font-mono text-muted-foreground" title={r.lock_tx_hash ?? undefined}>
                      {r.lock_tx_hash ? shortHash(r.lock_tx_hash) : "—"}
                    </TableCell>
                    <TableCell className="text-[10px]">
                      {r.hedera_mint_status === "minted" ? (
                        <span className="font-mono text-muted-foreground" title={r.hedera_mint_tx_hash ?? undefined}>
                          {r.hedera_mint_tx_hash ? shortHash(r.hedera_mint_tx_hash) : "minted"}
                        </span>
                      ) : r.bootstrap_status === "locked" ? (
                        <Badge variant="secondary" className="text-[10px]">pending</Badge>
                      ) : (
                        "—"
                      )}
                    </TableCell>
                    <TableCell className="text-[10px] font-mono text-muted-foreground" title={r.beneficiary_address ?? undefined}>
                      {r.beneficiary_address ? shortAddr(r.beneficiary_address) : "—"}
                    </TableCell>
                    <TableCell>
                      {(r.bootstrap_status ?? "created") === "created" && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="text-[10px] h-7"
                          disabled={rwaCreationInProgress || bootstrapLoadingId !== null}
                          onClick={() => handleBootstrapExisting(r.rwa_adi_id)}
                        >
                          {bootstrapLoadingId === r.rwa_adi_id ? "…" : "Bootstrap"}
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Failed / Needs Attention */}
      {(failedOrders.length > 0 || staleRwas.length > 0) && (
        <Card className="bg-card/40 border-muted/10 border-destructive/20">
          <CardHeader>
            <CardTitle className="text-xl font-headline flex items-center gap-2">
              <AlertCircle className="w-5 h-5 text-destructive" /> Failed / Needs Attention
            </CardTitle>
            <CardDescription className="text-xs">Failed or liquidated orders; RWAs with no recent data.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {failedOrders.length > 0 && (
              <div>
                <p className="text-xs font-headline uppercase tracking-widest text-muted-foreground mb-2">Failed orders</p>
                <Table>
                  <TableHeader className="bg-sidebar/50">
                    <TableRow className="border-muted/10">
                      <TableHead className="text-[10px] font-headline uppercase tracking-widest">Request ID</TableHead>
                      <TableHead className="text-[10px] font-headline uppercase tracking-widest">Beneficiary</TableHead>
                      <TableHead className="text-[10px] font-headline uppercase tracking-widest">Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {failedOrders.map((o) => (
                      <TableRow key={o.optionId} className="border-muted/10">
                        <TableCell className="text-[10px] font-mono">{o.optionId}</TableCell>
                        <TableCell className="text-[10px] font-mono">{shortAddr(o.buyer)}</TableCell>
                        <TableCell>
                          <Badge variant="destructive" className="text-[10px]">{o.statusLabel}</Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
            {staleRwas.length > 0 && (
              <div>
                <p className="text-xs font-headline uppercase tracking-widest text-muted-foreground mb-2">Stale RWAs (no data in {STALE_RWA_MINUTES}+ min)</p>
                <ul className="text-sm space-y-1">
                  {staleRwas.map((r) => (
                    <li key={r.rwa_adi_id} className="font-mono">
                      RWA {r.rwa_adi_id}: no data since {r.latest_ts ? new Date(r.latest_ts).toLocaleString() : "ever"}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </CardContent>
        </Card>
      )}

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
