import { HttpError } from "./http";
import { type Doc, store } from "./store";

export function isActiveBan(ban: Doc): boolean {
  return ban.status !== "lifted";
}

export async function requireNoActiveBan(userId: string): Promise<void> {
  const bans = await store.findByField("bans", "user_id", userId);

  if (bans.some(isActiveBan)) {
    throw new HttpError(403, "Access is suspended.");
  }
}
