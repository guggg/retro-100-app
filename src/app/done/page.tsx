"use client";

import { useRouter } from "next/navigation";

export default function DonePage() {
  const router = useRouter();

  return (
    <div className="done-container">
      <div className="done-emoji">🚀</div>
      <h1 className="done-title">感謝你的參與！</h1>
      <p className="done-subtitle">
        你的匿名摘要已安全儲存。主持人會在 Retro 會議中統整所有人的回饋。
      </p>
      <button
        className="btn btn-secondary"
        style={{ marginTop: "2rem", flex: "none" }}
        onClick={() => router.push("/")}
      >
        回到首頁
      </button>
    </div>
  );
}
