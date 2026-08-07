import type Stripe from "stripe";
import { afterEach, describe, expect, it, vi } from "vitest";

import { stripeClient } from "./integrations";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("createBanAppealCheckout", () => {
  it("uses the same idempotency key for duplicate appeal checkouts", async () => {
    const create = vi.fn().mockResolvedValue({
      id: "cs_appeal_123",
      url: "https://checkout.stripe.test/appeal-123"
    });

    vi.spyOn(stripeClient, "configured", "get").mockReturnValue(true);

    vi.spyOn(stripeClient, "client").mockReturnValue({
      checkout: {
        sessions: {
          create
        }
      }
    } as unknown as Stripe);

    const options = {
      appealId: "appeal-123",
      banId: "ban-123",
      userId: "user-123"
    };

    await stripeClient.createBanAppealCheckout(options);
    await stripeClient.createBanAppealCheckout(options);

    expect(create).toHaveBeenCalledTimes(2);
    expect(create).toHaveBeenNthCalledWith(
      1,
      expect.any(Object),
      {
        idempotencyKey: "ban-appeal-review:appeal-123"
      }
    );
    expect(create).toHaveBeenNthCalledWith(
      2,
      expect.any(Object),
      {
        idempotencyKey: "ban-appeal-review:appeal-123"
      }
    );
  });
});
