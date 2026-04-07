import { NextRequest, NextResponse } from "next/server";
import members from "@/data/members.json";
import { createToken } from "@/lib/auth";
import { checkRateLimit } from "@/lib/rate-limit";

export async function POST(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for") || "unknown";
  if (!checkRateLimit(`verify:${ip}`)) {
    return NextResponse.json({ error: "請求過於頻繁，請稍後再試" }, { status: 429 });
  }

  try {
    const { memberId, pin } = await req.json();

    const member = members.find((m) => m.id === memberId);
    if (!member) {
      return NextResponse.json({ error: "找不到此成員" }, { status: 404 });
    }

    if (member.pin !== pin) {
      return NextResponse.json({ error: "PIN 碼錯誤" }, { status: 401 });
    }

    const token = createToken(memberId);

    return NextResponse.json({ success: true, name: member.name, token });
  } catch (error) {
    console.error("Auth error:", error);
    return NextResponse.json({ error: "驗證失敗" }, { status: 500 });
  }
}
