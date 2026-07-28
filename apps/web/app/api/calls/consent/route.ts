import { NextResponse } from "next/server";
import { currentUserId } from "@server/auth";
import { HttpError, apiRoute, parseBody } from "@server/http";
import { consentRecordCreate } from "@server/schemas";
import { getOwnedSession } from "@server/sessions";
import { store, utcNow } from "@server/store";
import { auditConsentRecordCreated } from "@server/audit";

export const POST = apiRoute(async (request) => {
  const userId = await currentUserId(request);
  const consent = await parseBody(request, consentRecordCreate);

  if (!consent.recording_consented || !consent.terms_consented) {
    throw new HttpError(403, "Consent is required before joining.");
  }
  await getOwnedSession(consent.session_id, userId);

  await store.create("consent_records", {
    session_id: consent.session_id,
    user_id: userId,
    recording_consented: consent.recording_consented,
    terms_consented: consent.terms_consented,
    consent_timestamp: utcNow()
  });
  auditConsentRecordCreated({
      sessionId: consent.session_id,
      userId: userId,
      recordingConsented: consent.recording_consented,
      termsConsented: consent.terms_consented
  });
  await store.update("sessions", consent.session_id, {
    consent_given_at: utcNow(),
    status: "consent_pending"
  });
  return NextResponse.json(
    { status: "recorded", session_id: consent.session_id },
    { status: 201 }
  );
});
