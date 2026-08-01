import { NextResponse } from "next/server";
import { requireRecordingWebhook } from "@server/auth";
import { apiRoute, parseBody } from "@server/http";
import { storageClient } from "@server/integrations";
import { recordingWebhookRequest } from "@server/schemas";
import { getSession } from "@server/sessions";
import { store, utcNow } from "@server/store";
import { auditRecordingStored } from "@server/audit";

export const POST = apiRoute(async (request) => {
  requireRecordingWebhook(request);
  const payload = await parseBody(request, recordingWebhookRequest);
  await getSession(payload.session_id);

  const objectName = `recordings/${payload.session_id}/${payload.provider_recording_id || "upload"}.bin`;
  const signedUploadUrl = await storageClient.signedRecordingUrl(objectName);
  const recording = await store.create("recordings", {
    session_id: payload.session_id,
    provider_recording_id: payload.provider_recording_id,
    source_url: payload.source_url,
    storage_path: objectName,
    signed_upload_url_created: Boolean(signedUploadUrl),
    duration_seconds: payload.duration_seconds,
    created_at: utcNow()
  });
  auditRecordingStored({
    sessionId: payload.session_id,
    providerRecordingId: payload.provider_recording_id,
  });
  await store.update("sessions", payload.session_id, { recording_url: objectName });
  return NextResponse.json(
    { recording, signed_upload_url: signedUploadUrl },
    { status: 201 }
  );
});
