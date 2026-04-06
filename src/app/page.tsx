"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import members from "@/data/members.json";

export default function HomePage() {
  const router = useRouter();
  const [selectedMember, setSelectedMember] = useState<string | null>(null);
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleCardClick = (memberId: string) => {
    setSelectedMember(memberId);
    setPin("");
    setError("");
  };

  const handleVerify = async () => {
    if (!selectedMember || !pin) return;
    setLoading(true);
    setError("");

    try {
      const res = await fetch("/api/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ memberId: selectedMember, pin }),
      });

      if (res.ok) {
        router.push(`/chat/${selectedMember}`);
      } else {
        const data = await res.json();
        setError(data.error || "驗證失敗");
      }
    } catch {
      setError("網路錯誤，請再試一次");
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      handleVerify();
    }
  };

  const selectedMemberData = members.find((m) => m.id === selectedMember);

  return (
    <div className="page-container">
      <header className="page-header">
        <h1 className="page-title">🤖 Retro AI Chat</h1>
        <p className="page-subtitle">
          選擇你的名字，開始跟 AI 引導員聊聊這個 Sprint
        </p>
      </header>

      <div className="member-grid">
        {members.map((member, index) => (
          <div
            key={member.id}
            className={`member-card animate-fade-in-up ${
              selectedMember === member.id ? "selected" : ""
            }`}
            style={{ animationDelay: `${index * 0.08}s` }}
            onClick={() => handleCardClick(member.id)}
          >
            <div className="member-avatar">
              {member.name.charAt(0).toUpperCase()}
            </div>
            <div className="member-name">{member.name}</div>
            <div className="member-role">{member.role}</div>
          </div>
        ))}
      </div>

      {selectedMember && (
        <div className="pin-overlay" onClick={() => setSelectedMember(null)}>
          <div className="pin-modal" onClick={(e) => e.stopPropagation()}>
            <div className="member-avatar" style={{ margin: "0 auto 1rem" }}>
              {selectedMemberData?.name.charAt(0).toUpperCase()}
            </div>
            <h3>嗨，{selectedMemberData?.name}！</h3>
            <p>請輸入你的 PIN 碼</p>
            <input
              className="pin-input"
              type="password"
              maxLength={4}
              placeholder="••••"
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
              onKeyDown={handleKeyDown}
              autoFocus
            />
            {error && <div className="pin-error">{error}</div>}
            <div className="pin-actions">
              <button
                className="btn btn-secondary"
                onClick={() => setSelectedMember(null)}
              >
                取消
              </button>
              <button
                className="btn btn-primary"
                onClick={handleVerify}
                disabled={pin.length < 4 || loading}
              >
                {loading ? "驗證中..." : "進入"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
