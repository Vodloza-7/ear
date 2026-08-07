import { NextResponse } from "next/server";
import { currentUserId } from "@server/auth";
import { isActiveBan } from "@server/bans";
import { HttpError, apiRoute, parseBody } from "@server/http";
import {
  BAN_APPEAL_REVIEW,
  stripeClient
} from "@server/integrations";
import { checkoutBanAppealRequest } from "@server/schemas";
import { store } from "@server/store";

export const POST = apiRoute(async (request) => {
  const userId = await currentUserId(request);
  const payload = await parseBody(request, checkoutBanAppealRequest);

  const appeal = await store.get("ban_appeals", payload.appeal_id);
  if (!appeal) {
    throw new HttpError(404, "Ban appeal not found.");
  }

  if (appeal.user_id !== userId) {
    throw new HttpError(403, "This appeal belongs to another user.");
  }

  if (appeal.status !== "payment_required") {
    throw new HttpError(409, "This appeal is not awaiting payment.");
  }

  if (appeal.review_fee_cents !== BAN_APPEAL_REVIEW.amount_cents) {
    throw new HttpError(409, "The appeal review fee is invalid.");
  }

  const banId = appeal.ban_id;
  if (typeof banId !== "string") {
    throw new HttpError(500, "The appeal has an invalid ban reference.");
  }

  const ban = await store.get("bans", banId);
  if (!ban) {
    throw new HttpError(404, "Ban not found.");
  }

  if (ban.user_id !== userId) {
    throw new HttpError(403, "This ban belongs to another user.");
  }

  if (ban.ban_type !== "standard" || !ban.appeal_eligible) {
    throw new HttpError(403, "This ban is not eligible for review.");
  }

  if (!isActiveBan(ban)) {
    throw new HttpError(409, "This ban has already been lifted.");
  }

  const checkout = await stripeClient.createBanAppealCheckout({
    appealId: appeal.id,
    banId,
    userId
  });

  await store.update("ban_appeals", appeal.id, {
    stripe_checkout_session_id: checkout.stripe_session_id
  });

  return NextResponse.json(
    {
      checkout_url: checkout.checkout_url,
      appeal_id: appeal.id,
      provider: "stripe",
      configured: checkout.configured
    },
    { status: 201 }
  );
});
