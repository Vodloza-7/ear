import { randomUUID } from "crypto";
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

  const storedSessionId = appeal.stripe_checkout_session_id;
  if (typeof storedSessionId === "string") {
    const openCheckout = await stripeClient.getOpenBanAppealCheckout(
      storedSessionId
    );
    if (openCheckout) {
      return NextResponse.json({
        checkout_url: openCheckout.checkout_url,
        appeal_id: appeal.id,
        provider: "stripe",
        configured: openCheckout.configured
      });
    }
  }

  const claim = await store.claimBanAppealCheckoutAttempt(
    appeal.id,
    randomUUID()
  );
  if (!claim) {
    throw new HttpError(404, "Ban appeal not found.");
  }

  let checkout: Awaited<
    ReturnType<typeof stripeClient.createBanAppealCheckout>
  >;
  if (claim.owner) {
    try {
      checkout = await stripeClient.createBanAppealCheckout({
        appealId: appeal.id,
        banId,
        userId,
        attemptId: claim.attemptId
      });
    } catch (error) {
      await store.failBanAppealCheckoutAttempt(appeal.id, claim.attemptId);
      throw error;
    }

    const stored = await store.completeBanAppealCheckoutAttempt(
      appeal.id,
      claim.attemptId,
      checkout.stripe_session_id
    );
    if (!stored) {
      throw new HttpError(409, "The checkout attempt is no longer active.");
    }
  } else {
    const stripeSessionId = await store.waitForBanAppealCheckoutAttempt(
      appeal.id,
      claim.attemptId
    );
    if (!stripeSessionId) {
      throw new HttpError(409, "The checkout attempt did not complete. Please retry.");
    }

    const openCheckout = await stripeClient.getOpenBanAppealCheckout(
      stripeSessionId
    );
    if (!openCheckout) {
      throw new HttpError(409, "The checkout session is no longer open. Please retry.");
    }
    checkout = openCheckout;
  }

  return NextResponse.json(
    {
      checkout_url: checkout.checkout_url,
      appeal_id: appeal.id,
      provider: "stripe",
      configured: checkout.configured
    },
    { status: claim.owner ? 201 : 200 }
  );
});
