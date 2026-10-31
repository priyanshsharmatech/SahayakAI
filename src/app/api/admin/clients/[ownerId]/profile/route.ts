import connectDb from "@/lib/db";
import ClientProfile from "@/model/clientProfile.model";
import { requireAdminSession, requireSuperAdminSession } from "@/lib/session";
import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";

const LIFECYCLES = ["active", "trial", "suspended"] as const;

function serialize(ownerId: string, p: Record<string, any> | null) {
  return {
    ownerId,
    notes: p?.notes ?? "",
    tags: p?.tags ?? [],
    lifecycle: p?.lifecycle ?? "active",
    monthlyMessageQuota: p?.monthlyMessageQuota ?? 0,
    featureFlags: p?.featureFlags ?? {},
    updatedAt: p?.updatedAt ?? null,
  };
}

// GET /api/admin/clients/[ownerId]/profile -> { profile } (default if none)
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ ownerId: string }> },
) {
  if (!(await requireAdminSession())) {
    return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  }
  const { ownerId } = await params;
  if (!mongoose.isValidObjectId(ownerId)) {
    return NextResponse.json({ message: "Invalid ownerId" }, { status: 400 });
  }
  try {
    await connectDb();
    const profile = await ClientProfile.findOne({ ownerId }).lean();
    return NextResponse.json({ profile: serialize(ownerId, profile as Record<string, any> | null) });
  } catch (e) {
    console.error("admin/clients/profile GET failed:", e);
    return NextResponse.json({ message: "Server error" }, { status: 500 });
  }
}

// PATCH /api/admin/clients/[ownerId]/profile { notes?, tags?, lifecycle?, monthlyMessageQuota?, featureFlags? } -> { profile }
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ ownerId: string }> },
) {
  // Superadmin-only: changes billing/quota/lifecycle/feature flags. Staff
  // (support/analyst) may read via GET but not mutate.
  if (!(await requireSuperAdminSession())) {
    return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  }
  const { ownerId } = await params;
  if (!mongoose.isValidObjectId(ownerId)) {
    return NextResponse.json({ message: "Invalid ownerId" }, { status: 400 });
  }
  try {
    const body = await req.json();
    const update: Record<string, unknown> = {};

    if (typeof body?.notes === "string") update.notes = body.notes;
    if (Array.isArray(body?.tags)) {
      update.tags = body.tags.filter((t: unknown) => typeof t === "string");
    }
    if (body?.lifecycle !== undefined) {
      if (!LIFECYCLES.includes(body.lifecycle)) {
        return NextResponse.json({ message: "Invalid lifecycle" }, { status: 400 });
      }
      update.lifecycle = body.lifecycle;
    }
    if (body?.monthlyMessageQuota !== undefined) {
      const q = Number(body.monthlyMessageQuota);
      if (!Number.isFinite(q) || q < 0) {
        return NextResponse.json(
          { message: "monthlyMessageQuota must be >= 0" },
          { status: 400 },
        );
      }
      update.monthlyMessageQuota = q;
    }
    if (body?.featureFlags && typeof body.featureFlags === "object" && !Array.isArray(body.featureFlags)) {
      const flags: Record<string, boolean> = {};
      for (const [k, v] of Object.entries(body.featureFlags)) {
        flags[k] = Boolean(v);
      }
      update.featureFlags = flags;
    }

    await connectDb();
    const profile = await ClientProfile.findOneAndUpdate(
      { ownerId },
      { $set: update, $setOnInsert: { ownerId } },
      { new: true, upsert: true, setDefaultsOnInsert: true },
    ).lean();

    return NextResponse.json({ profile: serialize(ownerId, profile as Record<string, any>) });
  } catch (e) {
    console.error("admin/clients/profile PATCH failed:", e);
    return NextResponse.json({ message: "Server error" }, { status: 500 });
  }
}
