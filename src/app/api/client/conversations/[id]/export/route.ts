import connectDb from "@/lib/db";
import Conversation from "@/model/conversation.model";
import Message from "@/model/message.model";
import { getSessionUser } from "@/lib/session";
import { getEffectiveOwnerId } from "@/lib/team";
import mongoose from "mongoose";
import { NextRequest, NextResponse } from "next/server";

function csvEscape(value: unknown): string {
  let s = value == null ? "" : String(value);
  // CSV formula-injection guard: a cell starting with = + - @ (or a tab/CR a
  // spreadsheet may trim to one of those) is treated as a formula by Excel/
  // Sheets. Visitor content is untrusted, so prefix a single quote to force it
  // to be read as text.
  if (/^[=+\-@\t\r]/.test(s)) {
    s = `'${s}`;
  }
  // Quote if it contains comma, quote, or newline; double up embedded quotes.
  if (/[",\r\n]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

// Export a conversation transcript as a CSV file.
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  if (!mongoose.isValidObjectId(id)) {
    return NextResponse.json({ message: "Invalid id" }, { status: 400 });
  }
  await connectDb();
  const ownerId = await getEffectiveOwnerId(user);

  const conversation = await Conversation.findOne({ _id: id, ownerId }).lean();
  if (!conversation) {
    return NextResponse.json({ message: "Not found" }, { status: 404 });
  }

  const messages = await Message.find({ conversationId: id })
    .sort({ createdAt: 1 })
    .lean<{ createdAt: Date; role: string; content: string }[]>();

  const lines = ["time,role,content"];
  for (const m of messages) {
    const time = m.createdAt ? new Date(m.createdAt).toISOString() : "";
    lines.push([csvEscape(time), csvEscape(m.role), csvEscape(m.content)].join(","));
  }
  const csv = lines.join("\r\n");

  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="conversation-${id}.csv"`,
    },
  });
}
