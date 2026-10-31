import connectDb from "@/lib/db";
import User from "@/model/user.model";
import { requireAdminSession } from "@/lib/session";
import { NextRequest, NextResponse } from "next/server";

const ROLES = ["superadmin", "support", "analyst"] as const;

function envSuperAdminEmails(): string[] {
  const raw = `${process.env.SUPER_ADMIN_EMAIL ?? ""},${process.env.SUPER_ADMIN_EMAILS ?? ""}`;
  return raw
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

// GET /api/admin/admins -> { admins } (superadmin-only)
export async function GET() {
  const admin = await requireAdminSession();
  if (!admin) {
    return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  }
  if (admin.adminRole !== "superadmin") {
    return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  }
  try {
    await connectDb();
    const dbAdmins = await User.find({ adminRole: { $in: ROLES } })
      .select("name email adminRole")
      .lean();

    const dbEmails = new Set(dbAdmins.map((u) => String(u.email).toLowerCase()));
    const admins: {
      _id: string;
      name: string;
      email: string;
      adminRole: string;
      source: "db" | "env";
    }[] = dbAdmins.map((u) => ({
      _id: String(u._id),
      name: u.name || "",
      email: u.email || "",
      adminRole: u.adminRole,
      source: "db",
    }));

    // Env-var superadmins that aren't already DB admins (read-only entries).
    for (const email of envSuperAdminEmails()) {
      if (!dbEmails.has(email)) {
        admins.push({
          _id: `env:${email}`,
          name: "",
          email,
          adminRole: "superadmin",
          source: "env",
        });
      }
    }

    return NextResponse.json({ admins });
  } catch (e) {
    console.error("admin/admins GET failed:", e);
    return NextResponse.json({ message: "Server error" }, { status: 500 });
  }
}

// POST /api/admin/admins { email, role } -> { admin } (superadmin-only)
export async function POST(req: NextRequest) {
  const admin = await requireAdminSession();
  if (!admin) {
    return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  }
  if (admin.adminRole !== "superadmin") {
    return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  }
  try {
    const body = await req.json();
    const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
    const role = body?.role;
    if (!email) {
      return NextResponse.json({ message: "email is required" }, { status: 400 });
    }
    if (!ROLES.includes(role)) {
      return NextResponse.json({ message: "Invalid role" }, { status: 400 });
    }

    await connectDb();
    const user = await User.findOneAndUpdate(
      { email },
      { $set: { adminRole: role } },
      { new: true },
    )
      .select("name email adminRole")
      .lean<{ _id: unknown; name?: string; email: string; adminRole: string }>();

    if (!user) {
      return NextResponse.json({ message: "No such user" }, { status: 404 });
    }

    return NextResponse.json({
      admin: {
        _id: String(user._id),
        name: user.name || "",
        email: user.email,
        adminRole: user.adminRole,
        source: "db",
      },
    });
  } catch (e) {
    console.error("admin/admins POST failed:", e);
    return NextResponse.json({ message: "Server error" }, { status: 500 });
  }
}
