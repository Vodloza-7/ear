import { NextResponse } from "next/server";
import { requireHost } from "@server/auth";
import { apiRoute, parseBody } from "@server/http";
import { endCallRequest } from "@server/schemas";
import { getSession } from "@server/sessions";
import { store, utcNow } from "@server/store";
import { auditCallEnded } from "@server/audit";

export const POST = apiRoute(async (request) => {
  await requireHost(request);
  const payload = await parseBody(request, endCallRequest);
  await getSession(payload.session_id);
  await store.update("sessions", payload.session_id, {
    status: "ended",
    ended_at: utcNow(),
    ended_by: "host",
    end_reason: payload.reason,
    refund_requested: payload.refund_requested
  });
  auditCallEnded({
    sessionId: payload.session_id,
    status:"ended"
    })
  return NextResponse.json({ status: "ended", session_id: payload.session_id });
});
