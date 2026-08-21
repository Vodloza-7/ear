import { NextResponse } from "next/server";
import { HttpError, apiRoute } from "@server/http";
import { BAN_APPEAL_REVIEW, stripeClient } from "@server/integrations";
import { store, utcNow } from "@server/store";
import { auditPaymentWebHookReceived } from "@server/audit";    

export const POST = apiRoute(async (request) => {
  const rawBody = await request.text();

  let payload: Record<string, unknown>;
  if (stripeClient.webhookConfigured) {
    try {
      payload = (await stripeClient.verifyWebhook(
        rawBody,
        request.headers.get("stripe-signature")
      )) as unknown as Record<string, unknown>;
    } catch {
      throw new HttpError(400, "Invalid Stripe webhook signature.");
    }
  } else if (
    process.env.NODE_ENV === "development" ||
    process.env.NODE_ENV === "test"
  ) {
    // Preview mode: no webhook secret configured (e.g. local dev).
    try {
      payload = JSON.parse(rawBody) as Record<string, unknown>;
    } catch {
      throw new HttpError(400, "Invalid JSON payload.");
    }
  } else {
    throw new HttpError(
      503,
      "Stripe webhook verification is not configured."
    );
  }

  const event = await store.create("stripe_events", { payload, status: "received" });

  const data = payload.data as { object?: {
    id?: string;
    client_reference_id?: string;
    payment_status?: string;
    amount_total?: number;
    currency?: string;
    metadata?: {
      payment_type?: string;
      appeal_id?: string;
      ban_id?: string;
      user_id?: string;
    };
   };
   } | undefined;
  const sessionId = data?.object?.client_reference_id;
  const checkoutSession = data?.object;
  const paymentType = checkoutSession?.metadata?.payment_type;
  const stripeEventId = payload.id as string | undefined;
  const stripeEventType = payload.type as string | undefined;
  const auditSessionId =
  paymentType === "ban_appeal_review"
    ? undefined
    : sessionId;
  const paymentCompleted =
    (stripeEventType === "checkout.session.completed" ||
      stripeEventType === "checkout.session.async_payment_succeeded") &&
    checkoutSession?.payment_status === "paid";
  const appealPaymentFailed =
  stripeEventType ===
    "checkout.session.async_payment_failed" &&
  paymentType === "ban_appeal_review";
  auditPaymentWebHookReceived({ sessionId: auditSessionId, stripeEventId, stripeEventType });
  if (sessionId && paymentType !== "ban_appeal_review" && paymentCompleted) {
    await store.update("sessions", sessionId, { status: "paid" });
  }
  if (
  paymentCompleted &&
  paymentType === "ban_appeal_review"
) {
  const appealId = checkoutSession?.metadata?.appeal_id;
  const banId = checkoutSession?.metadata?.ban_id;
  const userId = checkoutSession?.metadata?.user_id;

  const validPayment =
    checkoutSession?.amount_total ===
      BAN_APPEAL_REVIEW.amount_cents &&
    checkoutSession?.currency === "usd";

  if (appealId && banId && userId && validPayment) {
    const appeal = await store.get("ban_appeals", appealId);

    const matchesAppeal =
      appeal &&
      appeal.ban_id === banId &&
      appeal.user_id === userId &&
      appeal.stripe_checkout_session_id === checkoutSession.id &&
      appeal.review_fee_cents ===
        BAN_APPEAL_REVIEW.amount_cents;

    if (
      matchesAppeal &&
      appeal.status === "payment_required"
    ) {
      await store.update("ban_appeals", appealId, {
        status: "awaiting_review"
      });
    }
  }
}
if (appealPaymentFailed) {
  const appealId =
    checkoutSession?.metadata?.appeal_id;

  const stripeSessionId =
    checkoutSession?.id;

  if (appealId && stripeSessionId) {
    await store.failBanAppealCheckoutSession(
      appealId,
      stripeSessionId
    );
  }
}
return NextResponse.json({ status: "received", event_id: event.id });
});
