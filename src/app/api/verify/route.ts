import { NextRequest, NextResponse } from "next/server";
import members from "@/data/members.json";

export async function POST(req: NextRequest) {
  try {
    const { memberId, pin } = await req.json();

    const member = members.find((m) => m.id === memberId);
    if (!member) {
      return NextResponse.json({ error: "找不到此成員" }, { status: 404 });
    }

    if (member.pin !== pin) {
      return NextResponse.json({ error: "PIN 碼錯誤" }, { status: 401 });
    }

    return NextResponse.json({ success: true, name: member.name });
  } catch (error) {
    console.error("Auth error:", error);
    return NextResponse.json({ error: "驗證失敗" }, { status: 500 });
  }
}
