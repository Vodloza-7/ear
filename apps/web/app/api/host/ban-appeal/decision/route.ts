import { NextResponse } from "next/server";
import { requireHost } from "@server/auth";
import { banAppealDecisionRequest } from "@server/schemas";
import { store } from "@server/store";
import { auditBanAppealDecision } from "@server/audit";
import { apiRoute, parseBody, HttpError } from "@server/http";

export const POST = apiRoute(async (request) => {
    const reviewer = await requireHost(request);
    const payload = await parseBody(request, banAppealDecisionRequest);
    const result = await store.decideBanAppeal(
        payload.appeal_id,
        payload.decision,
        reviewer.uid,
    );
    if (!result) {
        throw new HttpError(400, "Failed to process ban appeal decision. Appeal may not exist or has already been decided.");
    }
    auditBanAppealDecision({
        appealId: result.appeal_id,
        banId: result.ban_id,
        userId: result.user_id,
        reviewerId: result.reviewed_by,
        decision : result.decision,
        }
    );
    return NextResponse.json({
        appeal_id: result.appeal_id,
        decision: result.decision,
        success: true,
    });
});