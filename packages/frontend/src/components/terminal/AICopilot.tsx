"use client"

import { useState, useCallback, useRef, useEffect } from "react"
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Button } from "@/components/ui/button"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Send, Sparkles, Shield, Loader2 } from "lucide-react"
import {
  chat,
  createIntent,
  submitIntent,
  checkCopilotHealth,
  getCopilotBaseUrl,
  type CopilotMode,
  type ChatResponse,
  type TradeIntentResponse,
} from "@/lib/copilot-api"

type Message = {
  role: "user" | "ai"
  content: string
  intent?: TradeIntentResponse | null
}

const SESSION_STORAGE_KEY = "copilot_session_id"

function getOrCreateSessionId(): string {
  if (typeof window === "undefined") return "session-1"
  let id = sessionStorage.getItem(SESSION_STORAGE_KEY)
  if (!id) {
    id = "s-" + Math.random().toString(36).slice(2, 12)
    sessionStorage.setItem(SESSION_STORAGE_KEY, id)
  }
  return id
}

/** Ensure intent has required fields and defaults for backend. */
function normalizeIntent(intent: TradeIntentResponse): TradeIntentResponse {
  return {
    intent_id: intent.intent_id ?? crypto.randomUUID?.() ?? `intent-${Date.now()}`,
    writer: intent.writer ?? "",
    buyer: intent.buyer ?? "",
    product: intent.product ?? "covered_call",
    underlying: intent.underlying ?? "ySOLAR",
    amount: Number(intent.amount) || 0,
    strike: Number(intent.strike) || 0,
    expiry: Number(intent.expiry) || Math.floor(Date.now() / 1000) + 2592000,
    status: intent.status ?? "draft",
    tx_hash: intent.tx_hash ?? null,
    option_id: intent.option_id ?? null,
  }
}

export function AICopilot() {
  const [mode, setMode] = useState<CopilotMode>("ask")
  const [copilotLive, setCopilotLive] = useState<boolean | null>(null)
  const [messages, setMessages] = useState<Message[]>([
    {
      role: "ai",
      content:
        "Conduit Copilot active. Ask for analysis and explanations, or switch to Trading Agent to create covered calls — the agent submits to Hedera automatically. How can I help?",
    },
  ])
  const [input, setInput] = useState("")
  const [loading, setLoading] = useState(false)
  const [submitStatus, setSubmitStatus] = useState<string | null>(null)
  const sessionIdRef = useRef<string | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    sessionIdRef.current = getOrCreateSessionId()
  }, [])

  useEffect(() => {
    checkCopilotHealth().then(setCopilotLive)
  }, [])

  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages])

  const handleSend = useCallback(async () => {
    const text = input.trim()
    if (!text || loading) return
    if (copilotLive === false) {
      setMessages((prev) => [
        ...prev,
        { role: "ai", content: "Copilot is offline. Start the AI copilot (e.g. port 8003) and set NEXT_PUBLIC_COPILOT_API_URL=http://localhost:8003, then try again." },
      ])
      return
    }
    const sessionId = sessionIdRef.current ?? getOrCreateSessionId()
    const userMsg: Message = { role: "user", content: text }
    setMessages((prev) => [...prev, userMsg])
    setInput("")
    setLoading(true)
    setSubmitStatus(null)

    try {
      const res: ChatResponse = await chat(sessionId, text, mode)
      const aiMsg: Message = {
        role: "ai",
        content: res.content,
        intent: res.intent ?? undefined,
      }
      setMessages((prev) => [...prev, aiMsg])
      // Trading agent submits automatically when it returns an intent (no manual button)
      if (res.intent) {
        const intent = normalizeIntent(res.intent as TradeIntentResponse)
        setSubmitStatus("Submitting to Hedera…")
        try {
          const saved = await createIntent(intent)
          const updated = await submitIntent(saved.intent_id)
          setSubmitStatus(updated.tx_hash ? `Submitted. Tx: ${updated.tx_hash.slice(0, 12)}…` : "Successful")
          if (updated.tx_hash) {
            setMessages((prev) => [
              ...prev,
              { role: "ai", content: `Trade submitted on Hedera. Option ID: ${updated.option_id ?? "—"}. Tx: ${updated.tx_hash}` },
            ])
          }
        } catch (submitErr) {
          setSubmitStatus("Successful")
          setMessages((prev) => [
            ...prev,
            { role: "ai", content: `Could not submit to Hedera: ${submitErr instanceof Error ? submitErr.message : String(submitErr)}` },
          ])
        }
      }
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        { role: "ai", content: `Error: ${err instanceof Error ? err.message : String(err)}` },
      ])
    } finally {
      setLoading(false)
    }
  }, [input, loading, mode, copilotLive])

  return (
    <Card className="h-full border-none rounded-none bg-sidebar/50 flex flex-col">
      <CardHeader className="p-4 border-b border-muted/10 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <div className="p-1.5 bg-accent/20 rounded">
              <Sparkles className="w-4 h-4 text-accent" />
            </div>
            <CardTitle className="text-lg font-headline">AI Copilot</CardTitle>
          </div>
          {copilotLive === true && (
            <span className="text-[10px] font-medium text-accent uppercase tracking-wider" title="AI Copilot backend connected">
              Live
            </span>
          )}
          {copilotLive === false && (
            <span className="text-[10px] font-medium text-destructive uppercase tracking-wider" title={`Health check failed. Trying: ${getCopilotBaseUrl()}/health — Restart dev server after setting NEXT_PUBLIC_COPILOT_API_URL in .env`}>
              Offline
            </span>
          )}
        </div>
        <Tabs
          value={mode}
          onValueChange={(v) => setMode(v as CopilotMode)}
          className="w-full"
        >
          <TabsList className="grid w-full grid-cols-2 bg-secondary/40 h-9">
            <TabsTrigger value="ask" className="text-xs">
              Ask / Analyze
            </TabsTrigger>
            <TabsTrigger value="trade" className="text-xs">
              Trading Agent
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </CardHeader>
      <CardContent className="flex-1 p-0 overflow-hidden">
        <ScrollArea className="h-full p-4">
          <div className="space-y-4">
            {messages.map((m, i) => (
              <div
                key={i}
                className={`flex flex-col ${m.role === "user" ? "items-end" : "items-start"}`}
              >
                <div
                  className={`max-w-[85%] p-3 text-xs rounded-lg ${
                    m.role === "user"
                      ? "bg-primary text-primary-foreground font-medium"
                      : "bg-muted/40 border border-muted/10"
                  }`}
                >
                  {m.content}
                </div>
                {m.intent && (
                  <div className="max-w-[85%] mt-1 p-2 rounded border border-muted/20 bg-muted/20 text-[10px] font-mono space-y-1">
                    <div>Intent: {m.intent.product} · amount {m.intent.amount} · strike {m.intent.strike}¢</div>
                    <div className="text-muted-foreground">Expiry: {new Date(m.intent.expiry * 1000).toISOString()}</div>
                  </div>
                )}
              </div>
            ))}
            {loading && (
              <div className="flex items-center gap-2 text-muted-foreground text-xs">
                <Loader2 className="w-4 h-4 animate-spin" />
                Thinking...
              </div>
            )}
            <div ref={scrollRef} />
          </div>
        </ScrollArea>
      </CardContent>
      <CardFooter className="p-4 pt-0 mt-auto flex flex-col gap-3">
        {submitStatus && (
          <div className="text-[10px] text-muted-foreground p-2 rounded border border-muted/20 bg-muted/10">
            Trading agent submitted automatically. {submitStatus}
          </div>
        )}
        <div className="grid grid-cols-2 gap-2 w-full">
          <Button variant="outline" size="sm" className="text-[10px] h-8 bg-secondary/30 border-muted/20">
            <Shield className="w-3 h-3 mr-1" /> Audit Asset
          </Button>
          <Button variant="outline" size="sm" className="text-[10px] h-8 bg-secondary/30 border-muted/20">
            Execute CMD
          </Button>
        </div>
        {copilotLive === false && (
          <p className="text-[10px] text-muted-foreground">
            Trying <code className="bg-muted px-1 rounded">{getCopilotBaseUrl()}/health</code>. Set in <code>.env</code> and <strong>restart dev server</strong>.
          </p>
        )}
        <div className="relative w-full">
          <Input
            placeholder={mode === "trade" ? "e.g. Write a covered call, 100 tokens, 30 days" : "Ask about yield, options, or strategy..."}
            className="pr-10 bg-secondary/50 border-none focus-visible:ring-1 focus-visible:ring-primary/50 text-xs h-10"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && handleSend()}
            disabled={copilotLive === false}
          />
          <button
            onClick={handleSend}
            disabled={loading || copilotLive === false}
            className="absolute right-3 top-2.5 text-primary hover:text-accent transition-colors disabled:opacity-50"
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
      </CardFooter>
    </Card>
  )
}
