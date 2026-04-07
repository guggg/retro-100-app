import { NextRequest } from "next/server";
import OpenAI from "openai";
import { buildPrompt } from "@/data/prompt-template";
import members from "@/data/members.json";
import { verifyToken } from "@/lib/auth";
import { checkRateLimit } from "@/lib/rate-limit";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY || "",
});

export async function POST(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for") || "unknown";
  if (!checkRateLimit(`chat:${ip}`)) {
    return new Response(JSON.stringify({ error: "請求過於頻繁" }), { status: 429 });
  }

  const authHeader = req.headers.get("authorization");
  const token = authHeader?.replace("Bearer ", "");
  if (!token || !verifyToken(token)) {
    return new Response(JSON.stringify({ error: "未授權" }), { status: 401 });
  }

  try {
    const { memberId, messages } = await req.json();

    const member = members.find((m) => m.id === memberId);
    if (!member) {
      return new Response("Member not found", { status: 404 });
    }

    const systemPrompt = buildPrompt({
      role: member.role,
      tasks: member.tasks,
      notes: member.notes,
    });

    const openaiMessages = [
      { role: "system" as const, content: systemPrompt },
      ...messages.map((msg: { role: string; content: string }) => ({
        role: msg.role as "user" | "assistant",
        content: msg.content,
      })),
    ];

    const stream = await openai.chat.completions.create({
      model: process.env.OPENAI_MODEL || "gpt-5.4-mini",
      messages: openaiMessages,
      stream: true,
    });

    const encoder = new TextEncoder();
    const readableStream = new ReadableStream({
      async start(controller) {
        try {
          for await (const chunk of stream) {
            const text = chunk.choices[0]?.delta?.content || "";
            if (text) {
              controller.enqueue(
                encoder.encode(`data: ${JSON.stringify({ text })}\n\n`)
              );
            }
          }
          controller.enqueue(encoder.encode("data: [DONE]\n\n"));
          controller.close();
        } catch (error) {
          console.error("Stream error:", error);
          controller.error(error);
        }
      },
    });

    return new Response(readableStream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  } catch (error: unknown) {
    console.error("Chat API error:", error);
    return new Response(JSON.stringify({ error: "聊天服務暫時無法使用，請稍後再試" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
