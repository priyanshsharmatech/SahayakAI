import { cookies } from "next/headers";
import { scalekit } from "./scalekit";

interface ScalekitType {
  sub: string;
  email?: string;
}

export async function getSession() {
  const session = await cookies();
  const token = session.get("access_token")?.value;
  if (!token) {
    return null;
  }
  try {
    const result: ScalekitType = await scalekit.validateToken(token);
    const user = await scalekit.user.getUser(result.sub);
    return user;
  } catch (error) {
    console.log(error);
  }
}
