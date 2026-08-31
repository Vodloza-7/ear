import { beforeEach, describe, expect, it, vi } from "vitest";

const { randomUUID } = vi.hoisted(() => ({
  randomUUID: vi.fn(() => "attempt-retry")
}));

vi.mock("crypto", () => ({
  randomUUID
}));

vi.mock("@server/auth", () => ({
  currentUserId: vi.fn().mockResolvedValue("user-123")
}));

vi.mock("@server/bans", () => ({
  isActiveBan: vi.fn(() => true)
}));

vi.mock("@server/http", () => ({
  HttpError: class HttpError extends Error {
    constructor(
      public status: number,
      message: string
    ) {
      super(message);
    }
  },

  apiRoute: (
    handler: (request: Request) => Promise<Response>
  ) => handler,

  parseBody: vi.fn().mockResolvedValue({
    appeal_id: "appeal-123"
  })
}));

vi.mock("@server/integrations", () => ({
  BAN_APPEAL_REVIEW: {
    amount_cents: 5000
  },

  stripeClient: {
    webhookConfigured: false,
    verifyWebhook: vi.fn(),
    getBanAppealCheckoutStatus: vi.fn(),
    createBanAppealCheckout: vi.fn()
  }
}));

vi.mock("@server/schemas", () => ({
  checkoutBanAppealRequest: {}
}));

vi.mock("@server/audit", () => ({
  auditPaymentWebHookReceived: vi.fn()
}));

vi.mock("@server/store", () => ({
  store: {
    create: vi.fn(),
    get: vi.fn(),
    update: vi.fn(),
    failBanAppealCheckoutSession: vi.fn(),
    claimBanAppealCheckoutAttempt: vi.fn(),
    completeBanAppealCheckoutAttempt: vi.fn(),
    failBanAppealCheckoutAttempt: vi.fn(),
    waitForBanAppealCheckoutAttempt: vi.fn()
  },

  utcNow: vi.fn(
    () => new Date("2026-08-21T00:00:00.000Z")
  )
}));

import { stripeClient } from "@server/integrations";
import { store } from "@server/store";
import { POST as checkoutPOST } from "./route";
import {
  POST as webhookPOST
} from "../../webhooks/stripe/route";

let attemptState: string;
let storedSessionId: string;

function failedPaymentWebhookRequest(): Request {
  return new Request(
    "http://localhost/api/webhooks/stripe",
    {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({
        id: "evt-failed",
        type:
          "checkout.session.async_payment_failed",
        data: {
          object: {
            id: "cs-old",
            client_reference_id: "appeal-123",
            payment_status: "unpaid",
            amount_total: 5000,
            currency: "usd",
            metadata: {
              payment_type: "ban_appeal_review",
              appeal_id: "appeal-123",
              ban_id: "ban-123",
              user_id: "user-123"
            }
          }
        }
      })
    }
  );
}

function checkoutRequest(): Request {
  return new Request(
    "http://localhost/api/checkout/ban-appeal",
    {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({
        appeal_id: "appeal-123"
      })
    }
  );
}

beforeEach(() => {
  vi.clearAllMocks();

  attemptState = "ready";
  storedSessionId = "cs-old";

  Object.defineProperty(
    stripeClient,
    "webhookConfigured",
    {
      configurable: true,
      value: false
    }
  );

  vi.mocked(store.create).mockResolvedValue({
    id: "stored-event-123"
  });

  vi.mocked(store.get).mockImplementation(
    async (collection) => {
      if (collection === "ban_appeals") {
        return {
          id: "appeal-123",
          user_id: "user-123",
          ban_id: "ban-123",
          status: "payment_required",
          review_fee_cents: 5000,
          stripe_checkout_session_id:
            storedSessionId,
          stripe_checkout_attempt_state:
            attemptState
        };
      }

      return {
        id: "ban-123",
        user_id: "user-123",
        ban_type: "standard",
        appeal_eligible: true,
        status: "active"
      };
    }
  );

  vi.mocked(
    store.failBanAppealCheckoutSession
  ).mockImplementation(
    async (appealId, stripeSessionId) => {
      if (
        appealId !== "appeal-123" ||
        stripeSessionId !== storedSessionId ||
        attemptState !== "ready"
      ) {
        return false;
      }

      attemptState = "failed";
      return true;
    }
  );

  vi.mocked(
    store.claimBanAppealCheckoutAttempt
  ).mockImplementation(
    async (
      appealId,
      proposedAttemptId,
      expectedSessionId
    ) => {
      if (
        appealId !== "appeal-123" ||
        expectedSessionId !== storedSessionId ||
        attemptState !== "failed"
      ) {
        return null;
      }

      attemptState = "pending";

      return {
        attemptId: proposedAttemptId,
        owner: true
      };
    }
  );

  vi.mocked(
    stripeClient.createBanAppealCheckout
  ).mockResolvedValue({
    configured: true,
    checkout_url:
      "https://checkout.stripe.test/retry",
    stripe_session_id: "cs-new"
  });

  vi.mocked(
    store.completeBanAppealCheckoutAttempt
  ).mockImplementation(
    async (
      appealId,
      attemptId,
      stripeSessionId
    ) => {
      if (
        appealId !== "appeal-123" ||
        attemptId !== "attempt-retry" ||
        attemptState !== "pending"
      ) {
        return false;
      }

      attemptState = "ready";
      storedSessionId = stripeSessionId;
      return true;
    }
  );
});

describe(
  "asynchronous ban appeal payment failure",
  () => {
    it("creates exactly one new Checkout Session after the stored session fails", async () => {
      await webhookPOST(
        failedPaymentWebhookRequest()
      );

      expect(
        store.failBanAppealCheckoutSession
      ).toHaveBeenCalledWith(
        "appeal-123",
        "cs-old"
      );

      expect(attemptState).toBe("failed");

      const response = await checkoutPOST(
        checkoutRequest()
      );

      expect(response.status).toBe(201);

      expect(
        store.claimBanAppealCheckoutAttempt
      ).toHaveBeenCalledWith(
        "appeal-123",
        "attempt-retry",
        "cs-old"
      );

      expect(
        stripeClient.createBanAppealCheckout
      ).toHaveBeenCalledTimes(1);

      expect(
        stripeClient.createBanAppealCheckout
      ).toHaveBeenCalledWith({
        appealId: "appeal-123",
        banId: "ban-123",
        userId: "user-123",
        attemptId: "attempt-retry"
      });

      expect(
        store.completeBanAppealCheckoutAttempt
      ).toHaveBeenCalledWith(
        "appeal-123",
        "attempt-retry",
        "cs-new"
      );

      expect(attemptState).toBe("ready");
      expect(storedSessionId).toBe("cs-new");
    });

    it("ignores a replayed old failure while the replacement is pending", async () => {
      await webhookPOST(
        failedPaymentWebhookRequest()
      );

      expect(attemptState).toBe("failed");

      let finishStripeCreation!: () => void;

      const pausedStripeCreation =
        new Promise<{
          configured: boolean;
          checkout_url: string;
          stripe_session_id: string;
        }>((resolve) => {
          finishStripeCreation = () => {
            resolve({
              configured: true,
              checkout_url:
                "https://checkout.stripe.test/retry",
              stripe_session_id: "cs-new"
            });
          };
        });

      vi.mocked(
        stripeClient.createBanAppealCheckout
      ).mockReturnValue(pausedStripeCreation);

      const checkoutPromise = checkoutPOST(
        checkoutRequest()
      );

      await vi.waitFor(() => {
        expect(
          stripeClient.createBanAppealCheckout
        ).toHaveBeenCalledTimes(1);
      });

      expect(attemptState).toBe("pending");
      expect(storedSessionId).toBe("cs-old");

      await webhookPOST(
        failedPaymentWebhookRequest()
      );

      expect(
        store.failBanAppealCheckoutSession
      ).toHaveBeenCalledTimes(2);

      /*
       * The replay must not change the replacement
       * from pending back to failed.
       */
      expect(attemptState).toBe("pending");
      expect(storedSessionId).toBe("cs-old");

      finishStripeCreation();

      const response = await checkoutPromise;

      expect(response.status).toBe(201);

      expect(
        stripeClient.createBanAppealCheckout
      ).toHaveBeenCalledTimes(1);

      expect(
        store.completeBanAppealCheckoutAttempt
      ).toHaveBeenCalledWith(
        "appeal-123",
        "attempt-retry",
        "cs-new"
      );

      expect(attemptState).toBe("ready");
      expect(storedSessionId).toBe("cs-new");
    });
  }
);
