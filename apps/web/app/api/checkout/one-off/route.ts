import { NextResponse } from "next/server";
import { currentUserId } from "@server/auth";
import { apiRoute, parseBody } from "@server/http";
import { ONE_OFF_PRODUCTS, stripeClient } from "@server/integrations";
import { checkoutOneOffRequest } from "@server/schemas";
import { store } from "@server/store";
import { requireNoActiveBan } from "@server/bans";
export const POST = apiRoute(async (request) => {
  const userId = await currentUserId(request);
  await requireNoActiveBan(userId);
  const payload = await parseBody(request, checkoutOneOffRequest);

  const product = ONE_OFF_PRODUCTS[payload.product];
  const session = await store.create("sessions", {
    user_id: userId,
    mode: payload.mode,
    type: product.type,
    duration_minutes: product.duration_minutes,
    price_paid: product.amount_cents + payload.priority_bid_cents,
    priority_bid: payload.priority_bid_cents,
    status: "checkout_pending",
    started_at: null,
    ended_at: null,
    recording_url: null,
    consent_given_at: null,
    grace_extended: false
  });

  const checkout = await stripeClient.createOneOffCheckout({
    sessionId: session.id,
    productKey: payload.product,
    priorityBidCents: payload.priority_bid_cents
  });

  await store.create("payments", {
    user_id: userId,
    session_id: session.id,
    amount_cents: product.amount_cents + payload.priority_bid_cents,
    stripe_checkout_session_id: checkout.stripe_session_id,
    status: checkout.configured ? "checkout_created" : "preview_checkout"
  });
  return NextResponse.json(
    {
      checkout_url: checkout.checkout_url,
      session_id: session.id,
      provider: "stripe",
      configured: checkout.configured
    },
    { status: 201 }
  );
});
