import "server-only";
import { cookies } from "next/headers";
import { readSessionToken, sessionCookie } from "@/lib/auth/session-token";
export {
  createSessionToken,
  readSessionToken,
  sessionCookie,
} from "@/lib/auth/session-token";
export type { SessionUser } from "@/lib/auth/session-token";

export async function getCurrentUser() {
  const cookieStore = await cookies();
  return readSessionToken(cookieStore.get(sessionCookie.name)?.value);
}
