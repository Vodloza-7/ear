import { NextResponse } from "next/server";
import { requireHost } from "@server/auth";
import { apiRoute, parseBody } from "@server/http";
import { banRequest } from "@server/schemas";
import { store } from "@server/store";
import { auditBanCreated } from "@server/audit";

export const POST = apiRoute(async (request) => {
  const actor = await requireHost(request);
  const payload = await parseBody(request, banRequest);
  const ban = await store.create("bans", {
    user_id: payload.user_id,
    ban_type: payload.ban_type,
    reason: payload.reason,
    appeal_eligible: payload.ban_type === "standard",
    status: "active",
    created_by: actor.uid,
  });
  auditBanCreated({
    userId: payload.user_id,
    banType: payload.ban_type,
    createdBy: actor.uid,
    banId: ban.id
  });
  return NextResponse.json(ban, { status: 201 });
});
