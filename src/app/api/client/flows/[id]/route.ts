import connectDb from "@/lib/db";
import BotFlow, { IFlowStep } from "@/model/botFlow.model";
import { getSessionUser } from "@/lib/session";
import { getEffectiveOwnerId, requirePermission } from "@/lib/team";
import mongoose from "mongoose";
import { NextRequest, NextResponse } from "next/server";

const STEP_TYPES = ["message", "choices", "collect", "handoff", "end"] as const;

/**
 * Validates and normalizes an incoming `steps` payload. Returns the cleaned
 * steps array, or null when the payload is not a well-formed array of steps.
 */
function sanitizeSteps(raw: unknown): IFlowStep[] | null {
  if (!Array.isArray(raw)) return null;
  const out: IFlowStep[] = [];
  for (const s of raw) {
    if (!s || typeof s !== "object") return null;
    const step = s as Record<string, unknown>;
    if (typeof step.id !== "string" || !step.id.trim()) return null;
    if (
      typeof step.type !== "string" ||
      !STEP_TYPES.includes(step.type as (typeof STEP_TYPES)[number])
    ) {
      return null;
    }

    const clean: IFlowStep = {
      id: step.id,
      type: step.type as IFlowStep["type"],
      text: typeof step.text === "string" ? step.text : "",
    };

    if (step.choices !== undefined) {
      if (!Array.isArray(step.choices)) return null;
      const choices: { label: string; next?: string }[] = [];
      for (const c of step.choices) {
        if (!c || typeof c !== "object") return null;
        const choice = c as Record<string, unknown>;
        if (typeof choice.label !== "string") return null;
        choices.push({
          label: choice.label,
          ...(typeof choice.next === "string" && choice.next
            ? { next: choice.next }
            : {}),
        });
      }
      clean.choices = choices;
    }

    if (typeof step.field === "string") clean.field = step.field;
    if (typeof step.next === "string") clean.next = step.next;

    out.push(clean);
  }
  return out;
}

// Update a flow (name / enabled / trigger / steps).
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

  const denied = await requirePermission(user, "manager");
  if (denied) return NextResponse.json({ message: denied.message }, { status: denied.status });

  const { id } = await params;
  if (!mongoose.isValidObjectId(id)) {
    return NextResponse.json({ message: "Invalid id" }, { status: 400 });
  }

  const body = await req.json().catch(() => ({}));

  // Validate steps up front so a bad payload never partially persists.
  let steps: IFlowStep[] | undefined;
  if (body.steps !== undefined) {
    const sanitized = sanitizeSteps(body.steps);
    if (!sanitized) {
      return NextResponse.json(
        { message: "steps must be an array of valid steps" },
        { status: 400 },
      );
    }
    steps = sanitized;
  }

  try {
    await connectDb();
    const ownerId = await getEffectiveOwnerId(user);
    const flow = await BotFlow.findOne({ _id: id, ownerId });
    if (!flow) return NextResponse.json({ message: "Not found" }, { status: 404 });

    if (typeof body.name === "string" && body.name.trim()) {
      flow.name = body.name.trim();
    }
    if (typeof body.enabled === "boolean") flow.enabled = body.enabled;
    if (typeof body.trigger === "string") flow.trigger = body.trigger.trim();
    if (steps !== undefined) flow.steps = steps;

    await flow.save();
    return NextResponse.json({ flow });
  } catch (e) {
    console.error("PUT /api/client/flows/[id] failed:", e);
    return NextResponse.json({ message: "Something went wrong" }, { status: 500 });
  }
}

// Delete a flow.
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

  const denied = await requirePermission(user, "manager");
  if (denied) return NextResponse.json({ message: denied.message }, { status: denied.status });

  const { id } = await params;
  if (!mongoose.isValidObjectId(id)) {
    return NextResponse.json({ message: "Invalid id" }, { status: 400 });
  }

  try {
    await connectDb();
    const ownerId = await getEffectiveOwnerId(user);
    const res = await BotFlow.deleteOne({ _id: id, ownerId });
    if (res.deletedCount === 0) {
      return NextResponse.json({ message: "Not found" }, { status: 404 });
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("DELETE /api/client/flows/[id] failed:", e);
    return NextResponse.json({ message: "Something went wrong" }, { status: 500 });
  }
}
