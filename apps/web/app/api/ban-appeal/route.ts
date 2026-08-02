import { NextResponse } from "next/server";
import { currentUser, requireSelfOrStaff } from "@server/auth";
import { HttpError, apiRoute, parseBody } from "@server/http";
import { banAppealRequest } from "@server/schemas";
import { store } from "@server/store";
import { auditBanAppealCreated } from "@server/audit";

export const POST = apiRoute(async (request) => {
  const actor = await currentUser(request);
  const payload = await parseBody(request, banAppealRequest);
  requireSelfOrStaff(actor, payload.user_id);

  const ban = await store.get("bans", payload.ban_id);
  if (!ban) {
    throw new HttpError(404, "Ban not found.");
  }
  if (!ban.appeal_eligible) {
    throw new HttpError(403, "This ban is not appeal eligible.");
  }
  if (ban.user_id !== payload.user_id) {
    throw new HttpError(403, "This ban belongs to another user.");
  }
  const appeal = await store.create("ban_appeals", {
    user_id: payload.user_id,
    ban_id: payload.ban_id,
    statement: payload.statement,
    review_fee_cents: 5000,
    status: "payment_required",
    created_by: actor.uid
  });
  auditBanAppealCreated({
    appealId: appeal.id,
    userId: payload.user_id,
    banId: payload.ban_id,
    createdBy: actor.uid,
    status: "payment_required",
    reviewFeeCents: 5000,
  });
  return NextResponse.json(appeal, { status: 201 });
});
