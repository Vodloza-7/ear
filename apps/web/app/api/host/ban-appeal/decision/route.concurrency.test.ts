import { beforeEach, describe, expect, it, vi } from "vitest";

type RecordData = Record<string, unknown>;
type Ref = { collection: "ban_appeals" | "bans"; id: string };

const mocks = vi.hoisted(() => ({
  requireHost: vi.fn(),
  auditBanAppealDecision: vi.fn(),
  adminFirestore: vi.fn(),
}));

vi.mock("@server/auth", () => ({ requireHost: mocks.requireHost }));
vi.mock("@server/audit", () => ({ auditBanAppealDecision: mocks.auditBanAppealDecision }));
vi.mock("@server/schemas", () => ({
  banAppealDecisionRequest: { parse: (value: unknown) => value },
}));
vi.mock("@server/http", async () => import("../../../../../server/http"));
vi.mock("@server/store", async () => import("../../../../../server/store"));
vi.mock("../../../../../server/firebase", () => ({ adminFirestore: mocks.adminFirestore }));

import { POST } from "./route";

function decisionRequest(decision: "approved" | "denied") {
  return new Request("http://localhost/api/host/ban-appeal/decision", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ appeal_id: "appeal-1", decision }),
  });
}

describe("competing ban appeal decisions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireHost.mockResolvedValue({ uid: "host-1", role: "host" });
  });

  it("commits and audits only one competing approve/deny request", async () => {
    const records: Record<Ref["collection"], Record<string, RecordData>> = {
      ban_appeals: {
        "appeal-1": {
          user_id: "user-1",
          ban_id: "ban-1",
          status: "awaiting_review",
        },
      },
      bans: {
        "ban-1": { user_id: "user-1", status: "active", ban_type: "standard" },
      },
    };
    let version = 0;
    let firstAttemptsReady = 0;
    let releaseFirstAttempts!: () => void;
    const firstAttemptBarrier = new Promise<void>((resolve) => {
      releaseFirstAttempts = resolve;
    });

    const firestore = {
      collection: (collection: Ref["collection"]) => ({
        doc: (id: string): Ref => ({ collection, id }),
      }),
      runTransaction: async <T>(callback: (transaction: {
        get: (ref: Ref) => Promise<{ exists: boolean; data: () => RecordData | undefined }>;
        update: (ref: Ref, values: RecordData) => void;
      }) => Promise<T>): Promise<T> => {
        let attempt = 0;
        while (true) {
          attempt += 1;
          const readVersion = version;
          const view = structuredClone(records);
          const writes: Array<{ ref: Ref; values: RecordData }> = [];
          const result = await callback({
            get: async (ref) => {
              const value = view[ref.collection][ref.id];
              return { exists: value !== undefined, data: () => value };
            },
            update: (ref, values) => {
              writes.push({ ref, values });
              Object.assign(view[ref.collection][ref.id], values);
            },
          });

          if (attempt === 1) {
            firstAttemptsReady += 1;
            if (firstAttemptsReady === 2) releaseFirstAttempts();
            await firstAttemptBarrier;
          }
          if (readVersion !== version) continue;

          for (const { ref, values } of writes) {
            Object.assign(records[ref.collection][ref.id], values);
          }
          version += 1;
          return result;
        }
      },
    };
    mocks.adminFirestore.mockReturnValue(firestore);

    const responses = await Promise.all([
      POST(decisionRequest("approved")),
      POST(decisionRequest("denied")),
    ]);

    expect(responses.map((response) => response.status).sort()).toEqual([200, 409]);
    expect(["approved", "denied"]).toContain(records.ban_appeals["appeal-1"].status);
    expect(mocks.auditBanAppealDecision).toHaveBeenCalledTimes(1);
    expect(mocks.auditBanAppealDecision).toHaveBeenCalledWith(
      expect.objectContaining({ decision: records.ban_appeals["appeal-1"].status }),
    );
  });
});
