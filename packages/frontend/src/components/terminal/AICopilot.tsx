
"use client"

import { useState } from "react"
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Button } from "@/components/ui/button"
import { MessageSquare, Send, Sparkles, Terminal, Shield } from "lucide-react"

type Message = {
  role: "user" | "ai"
  content: string
}

export function AICopilot() {
  const [messages, setMessages] = useState<Message[]>([
    { role: "ai", content: "Conduit Copilot active. How can I assist with your trading strategy today?" }
  ])
  const [input, setInput] = useState("")

  const handleSend = () => {
    if (!input.trim()) return
    const userMsg = { role: "user" as const, content: input }
    setMessages([...messages, userMsg])
    setInput("")

    // Mock response
    setTimeout(() => {
      setMessages(prev => [...prev, {
        role: "ai",
        content: `Analyzing "${input}"... Strategy simulation complete. Based on current network telemetry, I recommend a limit order at $2,420 with a 0.5% stop loss for optimal capital preservation.`
      }])
    }, 1000)
  }

  return (
    <Card className="h-full border-none rounded-none bg-sidebar/50 flex flex-col">
      <CardHeader className="p-4 border-b border-muted/10">
        <div className="flex items-center gap-2">
          <div className="p-1.5 bg-accent/20 rounded">
            <Sparkles className="w-4 h-4 text-accent" />
          </div>
          <CardTitle className="text-lg font-headline">AI Copilot</CardTitle>
        </div>
      </CardHeader>
      <CardContent className="flex-1 p-0 overflow-hidden">
        <ScrollArea className="h-full p-4">
          <div className="space-y-4">
            {messages.map((m, i) => (
              <div key={i} className={`flex flex-col ${m.role === 'user' ? 'items-end' : 'items-start'}`}>
                <div className={`max-w-[85%] p-3 text-xs rounded-lg ${
                  m.role === 'user' 
                    ? 'bg-primary text-primary-foreground font-medium' 
                    : 'bg-muted/40 border border-muted/10'
                }`}>
                  {m.content}
                </div>
              </div>
            ))}
          </div>
        </ScrollArea>
      </CardContent>
      <CardFooter className="p-4 pt-0 mt-auto flex flex-col gap-3">
        <div className="grid grid-cols-2 gap-2 w-full">
          <Button variant="outline" size="sm" className="text-[10px] h-8 bg-secondary/30 border-muted/20">
            <Shield className="w-3 h-3 mr-1" /> Audit Asset
          </Button>
          <Button variant="outline" size="sm" className="text-[10px] h-8 bg-secondary/30 border-muted/20">
            <Terminal className="w-3 h-3 mr-1" /> Execute CMD
          </Button>
        </div>
        <div className="relative w-full">
          <Input 
            placeholder="Command Copilot..." 
            className="pr-10 bg-secondary/50 border-none focus-visible:ring-1 focus-visible:ring-primary/50 text-xs h-10"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSend()}
          />
          <button 
            onClick={handleSend}
            className="absolute right-3 top-2.5 text-primary hover:text-accent transition-colors"
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
      </CardFooter>
    </Card>
  )
}
