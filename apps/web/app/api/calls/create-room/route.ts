import { NextResponse } from "next/server";
import { currentUserId } from "@server/auth";
import { HttpError, apiRoute, parseBody } from "@server/http";
import { callsClient } from "@server/integrations";
import { createRoomRequest } from "@server/schemas";
import { getOwnedSession } from "@server/sessions";
import { store, utcNow } from "@server/store";
import { auditCallStarted } from "@server/audit";
import { requireNoActiveBan } from "@server/bans";

export const POST = apiRoute(async (request) => {
  const userId = await currentUserId(request);
  await requireNoActiveBan(userId);
  const payload = await parseBody(request, createRoomRequest);

  if (!payload.consent_given) {
    throw new HttpError(403, "Recording consent is required before joining.");
  }
  const session = await getOwnedSession(payload.session_id, userId);

  const room = await callsClient.createRoom({ sessionId: payload.session_id, userId });
  await store.update("sessions", payload.session_id, {
    status: "active",
    started_at: utcNow()
  });
  auditCallStarted({
    sessionId: payload.session_id,
    userId,
    status: "active"
  });
  return NextResponse.json({ session, room }, { status: 201 });
});
