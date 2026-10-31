import connectDb from "@/lib/db";
import ClientAudit, { IClientAudit } from "@/model/clientAudit.model";

/** Best-effort workspace audit entry. Never throws. */
export async function logClientAction(entry: IClientAudit): Promise<void> {
  try {
    await connectDb();
    await ClientAudit.create(entry);
  } catch (e) {
    console.error("Client audit log failed:", e);
  }
}
