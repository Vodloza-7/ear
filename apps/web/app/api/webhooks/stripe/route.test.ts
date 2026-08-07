import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@server/http", () => ({
  HttpError: class HttpError extends Error {
    status: number;

    constructor(status: number, message: string) {
      super(message);
      this.status = status;
    }
  },

  apiRoute: (
    handler: (request: Request) => Promise<Response>
  ) => handler
}));
vi.mock("@server/integrations", () => ({
  BAN_APPEAL_REVIEW: {
    amount_cents: 5000
  },
  stripeClient: {
    webhookConfigured: false,
    verifyWebhook: vi.fn()
  }
}));

vi.mock("@server/store", () => ({
  store: {
    create: vi.fn(),
    get: vi.fn(),
    update: vi.fn()
  },
  utcNow: vi.fn(() => new Date("2026-08-07T00:00:00.000Z"))
}));

vi.mock("@server/audit", () => ({
  auditPaymentWebHookReceived: vi.fn()
}));

import { stripeClient } from "@server/integrations";
import { store } from "@server/store";
import { POST } from "./route";

function stripeRequest({
  amountTotal = 5000,
  paymentStatus = "paid",
  normalSession = false,
  eventType = "checkout.session.completed",
  currency = "usd",
  metadataUserId = "user-123",
  signature,
}: {
  amountTotal?: number;
  paymentStatus?: string;
  normalSession?:boolean;
  eventType?: string;
  currency?: string;
  metadataUserId?: string;
  signature?: string;
} = {}): Request {
  return new Request("http://localhost/api/webhooks/stripe", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(signature ? { "stripe-signature": signature } : {})
    },
    body: JSON.stringify({
      id: "evt-123",
      type: eventType,
      data: {
        object: {
          id: "cs-123",
          client_reference_id: normalSession ? "session-123":"appeal-123" ,
          payment_status: paymentStatus,
          amount_total: amountTotal,
          currency,
          metadata: normalSession
          ?{
            session_id : "session-123" ,
            product: "quick_call"
          }
        :{
            payment_type: "ban_appeal_review",
            appeal_id: "appeal-123",
            ban_id: "ban-123",
            user_id: metadataUserId
          }
        }
      }
    })
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  Object.defineProperty(stripeClient, "webhookConfigured", {
    configurable: true,
    value: false
  });

  vi.mocked(store.create).mockResolvedValue({
    id: "stored-event-123"
  });

  vi.mocked(store.get).mockResolvedValue({
    id: "appeal-123",
    ban_id: "ban-123",
    user_id: "user-123",
    stripe_checkout_session_id: "cs-123",
    review_fee_cents: 5000,
    status: "payment_required"
  });

  vi.mocked(store.update).mockResolvedValue({
    id: "appeal-123",
    status: "awaiting_review"
  });
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("Stripe ban appeal payment webhook", () => {
  it("verifies a signed webhook before advancing the appeal", async () => {
    Object.defineProperty(stripeClient, "webhookConfigured", {
      configurable: true,
      value: true
    });
    const request = stripeRequest({ signature: "signed-header" });
    const rawBody = await request.clone().text();
    vi.mocked(stripeClient.verifyWebhook).mockResolvedValue(
      JSON.parse(rawBody) as never
    );

    await POST(request);

    expect(stripeClient.verifyWebhook).toHaveBeenCalledWith(
      rawBody,
      "signed-header"
    );
    expect(store.update).toHaveBeenCalledWith(
      "ban_appeals",
      "appeal-123",
      { status: "awaiting_review" }
    );
  });

  it("rejects an unsigned webhook in production when verification is not configured", async () => {
    vi.stubEnv("NODE_ENV", "production");

    await expect(POST(stripeRequest())).rejects.toThrow(
      "Stripe webhook verification is not configured."
    );
    expect(store.create).not.toHaveBeenCalled();
    expect(store.update).not.toHaveBeenCalled();
  });

  it("moves a paid appeal to awaiting review", async () => {
    const response = await POST(stripeRequest());

    expect(response.status).toBe(200);

    expect(store.update).toHaveBeenCalledWith(
      "ban_appeals",
      "appeal-123",
      {
        status: "awaiting_review"
      }
    );
  });

  it("advances an appeal after asynchronous payment succeeds", async () => {
    await POST(
      stripeRequest({
        eventType: "checkout.session.async_payment_succeeded"
      })
    );

    expect(store.update).toHaveBeenCalledWith(
      "ban_appeals",
      "appeal-123",
      {
        status: "awaiting_review"
      }
    );
  });

  it("does not advance an appeal with the wrong amount", async () => {
    await POST(stripeRequest({ amountTotal: 100 }));

    expect(store.update).not.toHaveBeenCalled();
  });

  it("does not advance an appeal with the wrong currency", async () => {
    await POST(stripeRequest({ currency: "eur" }));

    expect(store.update).not.toHaveBeenCalled();
  });

  it("does not advance an appeal with mismatched metadata", async () => {
    await POST(stripeRequest({ metadataUserId: "different-user" }));

    expect(store.update).not.toHaveBeenCalled();
  });

  it("does not advance an unpaid appeal checkout", async () => {
    await POST(stripeRequest({ paymentStatus: "unpaid" }));

    expect(store.update).not.toHaveBeenCalled();
  });

  it("does not advance an appeal when the Checkout Session ID does not match", async () => {
    vi.mocked(store.get).mockResolvedValue({
      id: "appeal-123",
      ban_id: "ban-123",
      user_id: "user-123",
      stripe_checkout_session_id: "cs-different",
      review_fee_cents: 5000,
      status: "payment_required"
    });

    await POST(stripeRequest());

    expect(store.update).not.toHaveBeenCalled();
  });

  it("preserves normal session payment handling", async () => {
  await POST(stripeRequest({ normalSession: true }));

  expect(store.update).toHaveBeenCalledWith(
    "sessions",
    "session-123",
    {
      status: "paid"
    }
  );
});
});
