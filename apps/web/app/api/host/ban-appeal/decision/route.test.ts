import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireHost: vi.fn(),
  decideBanAppeal: vi.fn(),
  auditBanAppealDecision: vi.fn(),
  parseBody: vi.fn(),
}));

vi.mock("@server/http", async () => import("../../../../../server/http"));
vi.mock("@server/auth", () => ({ requireHost: mocks.requireHost }));
vi.mock("@server/store", () => ({ store: { decideBanAppeal: mocks.decideBanAppeal } }));
vi.mock("@server/audit", () => ({ auditBanAppealDecision: mocks.auditBanAppealDecision }));
vi.mock("@server/schemas", () => ({
  banAppealDecisionRequest: { parse: mocks.parseBody },
}));

import { HttpError } from "@server/http";
import { POST } from "./route";

function request() {
  return new Request("http://localhost/api/host/ban-appeal/decision", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ appeal_id: "appeal-1", decision: "approved" }),
  });
}

describe("POST /api/host/ban-appeal/decision", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireHost.mockResolvedValue({ uid: "host-1", role: "host" });
  });

  it("requires a host", async () => {
    mocks.requireHost.mockRejectedValueOnce(new HttpError(403, "Host access is required"));
    const response = await POST(request());
    expect(response.status).toBe(403);
    expect(mocks.decideBanAppeal).not.toHaveBeenCalled();
    expect(mocks.auditBanAppealDecision).not.toHaveBeenCalled();
  });

  it.each(["approved", "denied"] as const)(
    "returns a successful %s decision and audits only after it commits",
    async (decision) => {
      mocks.parseBody.mockResolvedValueOnce({ appeal_id: "appeal-1", decision });
      mocks.decideBanAppeal.mockResolvedValueOnce({
        appeal_id: "appeal-1",
        decision,
        ban_id: "ban-1",
        user_id: "user-1",
        reviewed_by: "host-1",
        reviewed_at: "2026-09-14T10:00:00.000Z",
      });
      const response = await POST(request());
      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toEqual({ appeal_id: "appeal-1", decision, success: true });
      expect(mocks.auditBanAppealDecision).toHaveBeenCalledWith({
        appealId: "appeal-1",
        banId: "ban-1",
        userId: "user-1",
        reviewerId: "host-1",
        decision,
      });
      expect(mocks.decideBanAppeal.mock.invocationCallOrder[0]).toBeLessThan(
        mocks.auditBanAppealDecision.mock.invocationCallOrder[0],
      );
    },
  );

  it.each([
    [404, "Ban appeal with ID missing does not exist."],
    [404, "Ban with ID missing does not exist."],
    [409, "Ban appeal user ID does not match ban user ID."],
    [409, "The associated ban is not active."],
  ] as const)(
    "returns HTTP %s for an expected rejection without auditing",
    async (status, detail) => {
      mocks.parseBody.mockResolvedValueOnce({ appeal_id: "appeal-1", decision: "approved" });
      mocks.decideBanAppeal.mockRejectedValueOnce(new HttpError(status, detail));
      const response = await POST(request());
      expect(response.status).toBe(status);
      await expect(response.json()).resolves.toEqual({ detail });
      expect(mocks.auditBanAppealDecision).not.toHaveBeenCalled();
    },
  );
});
