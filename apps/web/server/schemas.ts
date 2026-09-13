import { z } from "zod";

// Ported from the FastAPI Pydantic models (`app/models.py`).

export const interactionMode = z.enum([
  "just_listen",
  "conversation",
  "deep_talk",
  "silent_company",
  "study_buddy",
  "game_mode"
]);

export const subscriptionPlan = z.enum(["text_friend", "friend", "close_friend", "always_there"]);

export const banType = z.enum(["standard", "extreme"]);

export const oneOffProduct = z.enum(["text_once", "quick_call", "standard_call", "long_call"]);

export const checkoutOneOffRequest = z.object({
  mode: interactionMode,
  product: oneOffProduct,
  priority_bid_cents: z.number().int().min(0).default(0)
});

export const checkoutSubscriptionRequest = z.object({
  plan: subscriptionPlan
});

export const queueJoinRequest = z.object({
  session_id: z.string().min(1),
  priority_bid_cents: z.number().int().min(0).default(0)
});

export const consentRecordCreate = z.object({
  session_id: z.string().min(1),
  recording_consented: z.boolean(),
  terms_consented: z.boolean()
});

export const createRoomRequest = z.object({
  session_id: z.string().min(1),
  consent_given: z.boolean()
});

export const hostJoinRoomRequest = z.object({
  session_id: z.string().min(1)
});

export const endCallRequest = z.object({
  session_id: z.string().min(1),
  ended_by: z.enum(["host", "user", "system"]),
  reason: z.string().max(120).default("ended"),
  refund_requested: z.boolean().default(false)
});

export const recordingWebhookRequest = z.object({
  session_id: z.string().min(1),
  provider_recording_id: z.string().nullish().default(null),
  source_url: z.string().nullish().default(null),
  duration_seconds: z.number().int().min(0).nullish().default(null)
});

export const messageCreate = z.object({
  receiver_id: z.string().min(1),
  session_id: z.string().nullish().default(null),
  content: z.string().min(1).max(5000)
});

export const banRequest = z.object({
  user_id: z.string().min(1),
  ban_type: banType,
  reason: z.string().min(3).max(500)
});

export const banAppealRequest = z.object({
  user_id: z.string().min(1),
  ban_id: z.string().min(1),
  statement: z.string().min(10).max(5000)
});
export const checkoutBanAppealRequest = z.object({
  appeal_id: z.string().min(1)
});

export const reportRequest = z.object({
  session_id: z.string().min(1),
  reason: z.string().min(3).max(500),
  details: z.string().max(5000).default("")
});

export const banAppealDecisionRequest = z.object({
  appeal_id: z.string().min(1),
  decision: z.enum(["approved", "denied"]),
});
export const hostStatusRequest = z.object({
  available: z.boolean(),
  note: z.string().max(500).default(""),
  energy: z.string().max(80).default("available")
});
