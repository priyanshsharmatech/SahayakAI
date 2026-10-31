import connectDb from "@/lib/db";
import AuditLog, { IAuditLog } from "@/model/auditLog.model";

/** Best-effort recording of a privileged admin action. Never throws. */
export async function logAdminAction(entry: IAuditLog): Promise<void> {
  try {
    await connectDb();
    await AuditLog.create(entry);
  } catch (e) {
    console.error("Audit log failed:", e);
  }
}
