"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";

interface Message {
  role: "user" | "assistant";
  content: string;
}

export default function ChatPage() {
  const params = useParams();
  const router = useRouter();
  const memberId = params.memberId as string;

  const storageKey = `retro-chat-${memberId}`;

  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [summaryDetected, setSummaryDetected] = useState(false);
  const [saving, setSaving] = useState(false);
  const [started, setStarted] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  // Load messages from localStorage on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved) {
        const parsed = JSON.parse(saved) as { messages: Message[]; summaryDetected: boolean };
        setMessages(parsed.messages);
        setSummaryDetected(parsed.summaryDetected || false);
        setStarted(true); // don't auto-start if we have history
      }
    } catch {
      // ignore parse errors
    }
    setHydrated(true);
  }, [storageKey]);

  // Save messages to localStorage whenever they change
  useEffect(() => {
    if (hydrated && messages.length > 0) {
      localStorage.setItem(
        storageKey,
        JSON.stringify({ messages, summaryDetected })
      );
    }
  }, [messages, summaryDetected, storageKey, hydrated]);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "44px";
      textareaRef.current.style.height =
        Math.min(textareaRef.current.scrollHeight, 120) + "px";
    }
  }, [input]);

  const sendMessage = useCallback(async (userMessage: string, currentMessages: Message[]) => {
    const newMessages: Message[] = [
      ...currentMessages,
      { role: "user", content: userMessage },
    ];
    setMessages(newMessages);
    setInput("");
    setIsStreaming(true);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          memberId,
          messages: newMessages,
        }),
      });

      if (!res.ok) throw new Error("Chat API error");

      const reader = res.body?.getReader();
      if (!reader) throw new Error("No reader");

      const decoder = new TextDecoder();
      let assistantMessage = "";

      setMessages((prev) => [...prev, { role: "assistant", content: "" }]);

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split("\n");

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            const data = line.slice(6);
            if (data === "[DONE]") continue;

            try {
              const parsed = JSON.parse(data);
              if (parsed.text) {
                assistantMessage += parsed.text;
                setMessages((prev) => {
                  const updated = [...prev];
                  updated[updated.length - 1] = {
                    role: "assistant",
                    content: assistantMessage,
                  };
                  return updated;
                });
              }
            } catch {
              // skip parse errors
            }
          }
        }
      }

      // Check if summary was generated
      if (
        assistantMessage.includes("[SUMMARY_START]") &&
        assistantMessage.includes("[SUMMARY_END]")
      ) {
        setSummaryDetected(true);
      }
    } catch (error) {
      console.error("Send error:", error);
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: "抱歉，發生了一些錯誤。請再試一次。",
        },
      ]);
    } finally {
      setIsStreaming(false);
    }
  }, [memberId]);

  // Start conversation automatically (only if no saved history)
  useEffect(() => {
    if (hydrated && !started) {
      setStarted(true);
      sendMessage("嗨，我準備好了！", []);
    }
  }, [hydrated, started, sendMessage]);

  const handleSend = () => {
    if (!input.trim() || isStreaming) return;
    sendMessage(input.trim(), messages);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    // Skip if IME is composing (e.g. Chinese/Japanese input method selecting characters)
    if (e.nativeEvent.isComposing || e.keyCode === 229) return;
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const extractSummary = (): string => {
    const lastAiMessage = [...messages]
      .reverse()
      .find((m) => m.role === "assistant" && m.content.includes("[SUMMARY_START]"));
    if (!lastAiMessage) return "";

    const match = lastAiMessage.content.match(
      /\[SUMMARY_START\]([\s\S]*?)\[SUMMARY_END\]/
    );
    return match ? match[1].trim() : "";
  };

  const handleSaveSummary = async () => {
    const summary = extractSummary();
    if (!summary) return;

    setSaving(true);
    try {
      const res = await fetch("/api/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ summaryMarkdown: summary }),
      });

      if (res.ok) {
        localStorage.removeItem(storageKey);
        router.push("/done");
      } else {
        alert("儲存失敗，請再試一次");
      }
    } catch {
      alert("網路錯誤，請再試一次");
    } finally {
      setSaving(false);
    }
  };

  const formatMessage = (content: string) => {
    // Remove the summary markers for display
    let display = content
      .replace("[SUMMARY_START]", "")
      .replace("[SUMMARY_END]", "");
    return display;
  };

  return (
    <div className="chat-container">
      {/* Header */}
      <div className="chat-header">
        <div className="chat-header-dot" />
        <div>
          <div className="chat-header-title">Retro AI 引導員</div>
          <div className="chat-header-subtitle">Sprint 回顧對話進行中</div>
        </div>
      </div>

      {/* Messages */}
      <div className="chat-messages">
        {messages
          .filter((m) => !(m.role === "user" && m.content === "嗨，我準備好了！"))
          .map((msg, i) => (
            <div
              key={i}
              className={`chat-bubble ${
                msg.role === "user" ? "chat-bubble-user" : "chat-bubble-ai"
              }`}
            >
              {formatMessage(msg.content)}
            </div>
          ))}

        {isStreaming && messages[messages.length - 1]?.role !== "assistant" && (
          <div className="typing-indicator">
            <div className="typing-dot" />
            <div className="typing-dot" />
            <div className="typing-dot" />
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Summary action bar */}
      {summaryDetected && (
        <div className="summary-actions">
          <button
            className="btn btn-success"
            onClick={handleSaveSummary}
            disabled={saving}
            style={{ flex: "none", padding: "0.75rem 2rem" }}
          >
            {saving ? "儲存中..." : "✅ 確認送出摘要"}
          </button>
        </div>
      )}

      {/* Input */}
      {!summaryDetected && (
        <div className="chat-input-container">
          <div className="chat-input-wrapper">
            <textarea
              ref={textareaRef}
              className="chat-input"
              placeholder="輸入你的想法..."
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={isStreaming}
              rows={1}
            />
            <button
              className="chat-send-btn"
              onClick={handleSend}
              disabled={!input.trim() || isStreaming}
            >
              ↑
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
