"use client";

/* eslint-disable @typescript-eslint/no-explicit-any */
declare global {
  interface Window {
    SpeechRecognition: any;
    webkitSpeechRecognition: any;
  }
}
/* eslint-enable @typescript-eslint/no-explicit-any */

import { useState, useRef, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import ReactMarkdown from "react-markdown";

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
  const [toast, setToast] = useState<string | null>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = (msg: string) => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setToast(msg);
    toastTimerRef.current = setTimeout(() => {
      setToast(null);
      toastTimerRef.current = null;
    }, 4000);
  };

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

  const [isListening, setIsListening] = useState(false);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recognitionRef = useRef<any>(null);
  const voiceBaseRef = useRef("");      // text in input before voice started
  const voiceFinalRef = useRef("");     // accumulated final transcripts

  // Cleanup speech recognition on unmount
  useEffect(() => {
    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.onresult = null;
        recognitionRef.current.onend = null;
        recognitionRef.current.onerror = null;
        recognitionRef.current.abort();
        recognitionRef.current = null;
      }
    };
  }, []);

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
      const token = sessionStorage.getItem("retro-token") || "";
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`,
        },
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
      let buffer = ""; // accumulate partial lines across chunks
      let rafPending = false;

      setMessages((prev) => [...prev, { role: "assistant", content: "" }]);

      const flushUI = () => {
        rafPending = false;
        setMessages((prev) => {
          const updated = [...prev];
          updated[updated.length - 1] = {
            role: "assistant",
            content: assistantMessage,
          };
          return updated;
        });
      };

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        // Keep last element — it may be incomplete
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            const data = line.slice(6);
            if (data === "[DONE]") continue;

            try {
              const parsed = JSON.parse(data);
              if (parsed.text) {
                assistantMessage += parsed.text;
              }
            } catch {
              // incomplete JSON — will be completed in next chunk
            }
          }
        }

        // Batch UI updates via requestAnimationFrame
        if (!rafPending) {
          rafPending = true;
          requestAnimationFrame(flushUI);
        }
      }

      // Final flush to ensure all text is rendered
      flushUI();

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
      const token = sessionStorage.getItem("retro-token") || "";
      const res = await fetch("/api/save", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`,
        },
        body: JSON.stringify({ summaryMarkdown: summary }),
      });

      if (res.ok) {
        localStorage.removeItem(storageKey);
        router.push("/done");
      } else {
        showToast("儲存失敗，請再試一次");
      }
    } catch {
      showToast("網路錯誤，請再試一次");
    } finally {
      setSaving(false);
    }
  };

  const toggleListening = () => {
    if (isListening) {
      recognitionRef.current?.stop();
      return;
    }

    const SpeechRecognition =
      window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      showToast("你的瀏覽器不支援語音輸入，請使用 Chrome 或 Edge。");
      return;
    }

    // Clean up previous instance if any
    if (recognitionRef.current) {
      recognitionRef.current.onresult = null;
      recognitionRef.current.onend = null;
      recognitionRef.current.onerror = null;
      recognitionRef.current.abort();
    }

    const recognition = new SpeechRecognition();
    recognition.lang = "zh-TW";
    recognition.interimResults = true;
    recognition.continuous = true;
    recognitionRef.current = recognition;
    voiceBaseRef.current = input;  // snapshot current input text
    voiceFinalRef.current = "";

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    recognition.onresult = (event: any) => {
      let interim = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          voiceFinalRef.current += transcript;
        } else {
          interim = transcript;
        }
      }
      // Always recompose: base + finals + current interim
      setInput(voiceBaseRef.current + voiceFinalRef.current + interim);
    };

    recognition.onend = () => {
      // Commit final text only (drop any leftover interim)
      setInput(voiceBaseRef.current + voiceFinalRef.current);
      setIsListening(false);
      recognitionRef.current = null;
    };

    recognition.onerror = () => {
      setInput(voiceBaseRef.current + voiceFinalRef.current);
      setIsListening(false);
      recognitionRef.current = null;
    };

    recognition.start();
    setIsListening(true);
  };

  const formatMessage = (content: string) => {
    // Remove the summary markers for display
    return content
      .replace("[SUMMARY_START]", "")
      .replace("[SUMMARY_END]", "");
  };

  return (
    <div className="chat-container">
      {/* Header */}
      <div className="chat-header">
        <button
          className="chat-back-btn"
          onClick={() => router.push("/")}
          aria-label="回到首頁"
        >
          ←
        </button>
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
              {msg.role === "assistant" ? (
                <ReactMarkdown>{formatMessage(msg.content)}</ReactMarkdown>
              ) : (
                formatMessage(msg.content)
              )}
            </div>
          ))}

        {isStreaming && messages[messages.length - 1]?.role !== "assistant" && (
          <div className="typing-indicator" role="status" aria-label="AI 正在輸入">
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
              className={`chat-mic-btn${isListening ? " chat-mic-btn-active" : ""}`}
              onClick={toggleListening}
              disabled={isStreaming}
              title="語音輸入"
            >
              {isListening ? "⏹" : "🎤"}
            </button>
            <button
              className="chat-send-btn"
              onClick={handleSend}
              disabled={!input.trim() || isStreaming}
              aria-label="發送訊息"
            >
              ↑
            </button>
          </div>
        </div>
      )}

      {/* Toast notification */}
      {toast && (
        <div className="toast" role="alert">
          {toast}
        </div>
      )}
    </div>
  );
}
