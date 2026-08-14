import { beforeEach, describe, expect, it, vi } from "vitest";

const { randomUUID } = vi.hoisted(() => ({
  randomUUID: vi.fn()
}));

vi.mock("crypto", () => ({ randomUUID }));
vi.mock("@server/auth", () => ({
  currentUserId: vi.fn().mockResolvedValue("user-123")
}));
vi.mock("@server/bans", () => ({ isActiveBan: vi.fn(() => true) }));
vi.mock("@server/http", () => ({
  HttpError: class HttpError extends Error {
    constructor(public status: number, message: string) {
      super(message);
    }
  },
  apiRoute: (handler: (request: Request) => Promise<Response>) => handler,
  parseBody: vi.fn().mockResolvedValue({ appeal_id: "appeal-123" })
}));
vi.mock("@server/integrations", () => ({
  BAN_APPEAL_REVIEW: { amount_cents: 5000 },
  stripeClient: {
    getOpenBanAppealCheckout: vi.fn(),
    createBanAppealCheckout: vi.fn()
  }
}));
vi.mock("@server/schemas", () => ({ checkoutBanAppealRequest: {} }));
vi.mock("@server/store", () => ({
  store: {
    get: vi.fn(),
    claimBanAppealCheckoutAttempt: vi.fn(),
    completeBanAppealCheckoutAttempt: vi.fn(),
    failBanAppealCheckoutAttempt: vi.fn(),
    waitForBanAppealCheckoutAttempt: vi.fn()
  }
}));

import { stripeClient } from "@server/integrations";
import { store } from "@server/store";
import { POST } from "./route";

const request = () =>
  new Request("http://localhost/api/checkout/ban-appeal", {
    method: "POST",
    body: JSON.stringify({ appeal_id: "appeal-123" })
  });

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(store.get).mockImplementation(async (collection) => {
    if (collection === "ban_appeals") {
      return {
        id: "appeal-123",
        user_id: "user-123",
        ban_id: "ban-123",
        status: "payment_required",
        review_fee_cents: 5000,
        stripe_checkout_session_id: "cs-old"
      };
    }
    return {
      id: "ban-123",
      user_id: "user-123",
      ban_type: "standard",
      appeal_eligible: true,
      status: "active"
    };
  });
  vi.mocked(store.claimBanAppealCheckoutAttempt).mockResolvedValue({
    attemptId: "attempt-new",
    owner: true
  });
  vi.mocked(store.completeBanAppealCheckoutAttempt).mockResolvedValue(true);
  vi.mocked(store.failBanAppealCheckoutAttempt).mockResolvedValue();
});

describe("ban appeal checkout retries", () => {
  it("reuses a stored Checkout Session while it is open", async () => {
    vi.mocked(stripeClient.getOpenBanAppealCheckout).mockResolvedValue({
      configured: true,
      checkout_url: "https://checkout.stripe.test/open",
      stripe_session_id: "cs-old"
    });

    const response = await POST(request());

    expect(response.status).toBe(200);
    expect(stripeClient.createBanAppealCheckout).not.toHaveBeenCalled();
    expect(store.claimBanAppealCheckoutAttempt).not.toHaveBeenCalled();
  });

  it("creates a new attempt after the stored Checkout Session expires", async () => {
    randomUUID.mockReturnValue("attempt-new");
    vi.mocked(stripeClient.getOpenBanAppealCheckout).mockResolvedValue(null);
    vi.mocked(stripeClient.createBanAppealCheckout).mockResolvedValue({
      configured: true,
      checkout_url: "https://checkout.stripe.test/new",
      stripe_session_id: "cs-new"
    });

    await POST(request());

    expect(store.claimBanAppealCheckoutAttempt).toHaveBeenCalledWith(
      "appeal-123",
      "attempt-new"
    );
    expect(stripeClient.createBanAppealCheckout).toHaveBeenCalledWith({
      appealId: "appeal-123",
      banId: "ban-123",
      userId: "user-123",
      attemptId: "attempt-new"
    });
    expect(store.completeBanAppealCheckoutAttempt).toHaveBeenCalledWith(
      "appeal-123",
      "attempt-new",
      "cs-new"
    );
  });

  it("uses a fresh attempt ID when retrying after checkout creation fails", async () => {
    randomUUID
      .mockReturnValueOnce("attempt-failed")
      .mockReturnValueOnce("attempt-retry");
    vi.mocked(stripeClient.getOpenBanAppealCheckout).mockResolvedValue(null);
    vi.mocked(store.claimBanAppealCheckoutAttempt)
      .mockResolvedValueOnce({ attemptId: "attempt-failed", owner: true })
      .mockResolvedValueOnce({ attemptId: "attempt-retry", owner: true });
    vi.mocked(stripeClient.createBanAppealCheckout)
      .mockRejectedValueOnce(new Error("Stripe unavailable"))
      .mockResolvedValueOnce({
        configured: true,
        checkout_url: "https://checkout.stripe.test/retry",
        stripe_session_id: "cs-retry"
      });

    await expect(POST(request())).rejects.toThrow("Stripe unavailable");
    await POST(request());

    expect(stripeClient.createBanAppealCheckout).toHaveBeenNthCalledWith(1, {
      appealId: "appeal-123",
      banId: "ban-123",
      userId: "user-123",
      attemptId: "attempt-failed"
    });
    expect(stripeClient.createBanAppealCheckout).toHaveBeenNthCalledWith(2, {
      appealId: "appeal-123",
      banId: "ban-123",
      userId: "user-123",
      attemptId: "attempt-retry"
    });
    expect(store.failBanAppealCheckoutAttempt).toHaveBeenCalledWith(
      "appeal-123",
      "attempt-failed"
    );
  });

  it("creates only one Checkout Session for concurrent requests", async () => {
    randomUUID
      .mockReturnValueOnce("attempt-owner")
      .mockReturnValueOnce("attempt-other");
    vi.mocked(stripeClient.getOpenBanAppealCheckout)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        configured: true,
        checkout_url: "https://checkout.stripe.test/shared",
        stripe_session_id: "cs-shared"
      });
    vi.mocked(store.claimBanAppealCheckoutAttempt)
      .mockResolvedValueOnce({ attemptId: "attempt-owner", owner: true })
      .mockResolvedValueOnce({ attemptId: "attempt-owner", owner: false });
    vi.mocked(stripeClient.createBanAppealCheckout).mockResolvedValue({
      configured: true,
      checkout_url: "https://checkout.stripe.test/shared",
      stripe_session_id: "cs-shared"
    });
    vi.mocked(store.waitForBanAppealCheckoutAttempt).mockResolvedValue(
      "cs-shared"
    );

    const responses = await Promise.all([POST(request()), POST(request())]);

    expect(responses.map((response) => response.status).sort()).toEqual([
      200,
      201
    ]);
    expect(stripeClient.createBanAppealCheckout).toHaveBeenCalledTimes(1);
    expect(stripeClient.createBanAppealCheckout).toHaveBeenCalledWith({
      appealId: "appeal-123",
      banId: "ban-123",
      userId: "user-123",
      attemptId: "attempt-owner"
    });
    expect(store.completeBanAppealCheckoutAttempt).toHaveBeenCalledTimes(1);
  });
});
