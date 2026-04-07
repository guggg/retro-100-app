import { NextRequest, NextResponse } from "next/server";
import { appendToSheet } from "@/lib/sheets";
import { verifyToken } from "@/lib/auth";
import { checkRateLimit } from "@/lib/rate-limit";

export async function POST(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for") || "unknown";
  if (!checkRateLimit(`save:${ip}`)) {
    return NextResponse.json({ error: "請求過於頻繁" }, { status: 429 });
  }

  const authHeader = req.headers.get("authorization");
  const token = authHeader?.replace("Bearer ", "");
  if (!token || !verifyToken(token)) {
    return NextResponse.json({ error: "未授權" }, { status: 401 });
  }

  try {
    const { summaryMarkdown } = await req.json();

    if (!summaryMarkdown) {
      return NextResponse.json(
        { error: "No summary provided" },
        { status: 400 }
      );
    }

    const timestamp = new Date().toISOString();

    // Extract fields from the markdown summary
    const idMatch = summaryMarkdown.match(/ID:\s*(\S+)/);
    const energyMatch = summaryMarkdown.match(/Energy Score\)\s*\|\s*([\d.]+)/);
    const emojiMatch = summaryMarkdown.match(/代表 Emoji\s*\|\s*(.+?)\s*\|/);
    const onelinerMatch = summaryMarkdown.match(/一句話心情\s*\|\s*(.+?)\s*\|/);

    const extractSection = (label: string): string => {
      const regex = new RegExp(
        `\\*\\*${label}[：:]?\\*\\*\\s*\\n>\\s*(.+?)(?=\\n\\n|\\n---|$)`,
        "s"
      );
      const match = summaryMarkdown.match(regex);
      return match ? match[1].trim() : "";
    };

    const row = [
      timestamp,
      idMatch ? idMatch[1] : "",
      energyMatch ? energyMatch[1] : "",
      emojiMatch ? emojiMatch[1].trim() : "",
      onelinerMatch ? onelinerMatch[1].trim() : "",
      extractSection("目前使用的工具清單"),
      extractSection("推薦給團隊的工具或技巧"),
      extractSection("使用痛點與挑戰"),
      extractSection("本 Sprint 重點與成果"),
      extractSection("遇到的挑戰或踩到的坑"),
      extractSection("值得分享的經驗或洞察"),
      extractSection("Top 1 Change Request（最想改變的一件事）"),
      summaryMarkdown,
    ];

    // Only save to Google Sheets if credentials are configured
    if (process.env.GOOGLE_SHEETS_CREDENTIALS && process.env.GOOGLE_SHEET_ID) {
      await appendToSheet([row]);
    } else {
      console.log("Google Sheets not configured. Summary row:", row);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Save API error:", error);
    return NextResponse.json(
      { error: "Failed to save summary" },
      { status: 500 }
    );
  }
}
