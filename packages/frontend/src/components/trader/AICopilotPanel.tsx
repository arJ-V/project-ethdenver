import { useState } from "react";
import { Send, Shield, Sparkles, Terminal } from "lucide-react";

interface ChatMessage {
  role: "user" | "assistant";
  text: string;
}

function simulateResponse(prompt: string) {
  const trimmed = prompt.trim();
  if (!trimmed) return "Share a trading command and I can draft a covered-call action.";
  if (trimmed.toLowerCase().includes("hedge")) {
    return "Hedge suggestion: lower strike and shorten expiry to reduce settlement volatility.";
  }
  if (trimmed.toLowerCase().includes("execute")) {
    return "Execution plan ready. Confirm buyer, strike, amount, and expiry to submit through /write-option.";
  }
  return "Context noted. I can transform this into an order intent and stage it for review.";
}

export function AICopilotPanel() {
  const [messages, setMessages] = useState<ChatMessage[]>([
    { role: "assistant", text: "Conduit Copilot active. How can I assist your strategy today?" },
  ]);
  const [draft, setDraft] = useState("");

  function handleSend(event: React.FormEvent) {
    event.preventDefault();
    if (!draft.trim()) return;
    const userMessage: ChatMessage = { role: "user", text: draft.trim() };
    const assistantMessage: ChatMessage = { role: "assistant", text: simulateResponse(draft) };
    setMessages((prev) => [...prev, userMessage, assistantMessage]);
    setDraft("");
  }

  return (
    <section className="panel trader-panel copilot-panel">
      <div className="panel-header">
        <h2 className="panel-title">
          <Sparkles size={14} /> AI Copilot
        </h2>
      </div>
      <div className="copilot-chat">
        {messages.map((message, index) => (
          <div key={`${message.role}-${index}`} className={`chat-row chat-row-${message.role}`}>
            <div className={`chat-bubble chat-bubble-${message.role}`}>
              {message.text}
            </div>
          </div>
        ))}
      </div>
      <div className="copilot-quick-actions">
        <button type="button">
          <Shield size={12} /> Audit Asset
        </button>
        <button type="button">
          <Terminal size={12} /> Execute CMD
        </button>
      </div>
      <form className="copilot-input" onSubmit={handleSend}>
        <input value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="Command Copilot..." />
        <button type="submit" aria-label="Send">
          <Send size={14} />
        </button>
      </form>
    </section>
  );
}
