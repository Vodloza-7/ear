import { beforeEach , describe , expect , it , vi } from "vitest";
const mocks = vi.hoisted(() => ({
    requireHost: vi.fn(),
    decideBanAppeal: vi.fn(),
    auditBanAppealDecision: vi.fn(),
    parseBody: vi.fn()
}));
vi.mock("@server/schemas", () => ({
    banAppealDecisionRequest: {
        parse: mocks.parseBody,
    },
}));
vi.mock("@server/http", () => {
    class HttpError extends Error {
        status: number;

        constructor(status: number, message: string) {
            super(message);
            this.status = status;
        }
    }
    return {
        HttpError,
        parseBody: mocks.parseBody,
        apiRoute: (handler: (request: Request) => Promise<Response>) => {
            return async (request: Request) => {
                try {
                    return await handler(request);
                } catch (error) {
                    if (error instanceof HttpError) {
                        return new Response(JSON.stringify({ error: error.message }), { status: error.status });
                    }
                    return new Response(JSON.stringify({ error: "Internal Server Error" }), { status: 500 });
                }
            };
    }
}
});

vi.mock("@server/auth" , () => ({
    requireHost: mocks.requireHost,
}));
vi.mock("@server/store" , () => ({
    store: {
        decideBanAppeal: mocks.decideBanAppeal,
    },
}));
vi.mock("@server/audit" , () => ({
    auditBanAppealDecision: mocks.auditBanAppealDecision,
}));

import { HttpError } from "@server/http";
import { POST } from "./route";
import { parse } from "node:path";

describe("POST /api/host/ban-appeal/decision", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("should require a host", async () => {
        const { HttpError } = await import("@server/http");
        mocks.requireHost.mockRejectedValueOnce(new HttpError(403, "Host access is required"));
        const request = new Request(
            "http://localhost:3000/api/host/ban-appeal/decision",
            { method: "POST" }
        );
        const response = await POST(request);
        expect(mocks.requireHost).toHaveBeenCalled();
        expect(response.status).toBe(403);
    });

    });
    it ("does not audit when the ban appeal decision fails", async () => {
        mocks.requireHost.mockResolvedValueOnce({ uid: "host-1", role: "host" });
        mocks.parseBody.mockResolvedValueOnce({ appeal_id: "appeal-1", decision: "approved" });
        mocks.decideBanAppeal.mockResolvedValueOnce(null);
        const request = new Request(
            "http://localhost:3000/api/host/ban-appeal/decision",
            {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    appealId: "appeal-1",
                    decision: "approved",
                }),
            },
        )

        console.log("POST typeof:", typeof POST);
        console.log("POST value:", POST);
        const response = await POST(request);
        expect(mocks.decideBanAppeal).toHaveBeenCalledWith("appeal-1", "approved", "host-1");
        expect(mocks.auditBanAppealDecision).not.toHaveBeenCalled();
        expect(response.status).toBe(400);
        });
