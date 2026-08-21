import { randomUUID } from "crypto";
import { Timestamp } from "firebase-admin/firestore";
import { adminFirestore } from "./firebase";

export type Doc = Record<string, unknown> & { id: string };

export type BanAppealCheckoutClaim = {
  attemptId: string;
  owner: boolean;
};

export const BAN_APPEAL_CHECKOUT_ATTEMPT_LEASE_MS = 2 * 60 * 1000;

export function utcNow(): Date {
  return new Date();
}

export function isBanAppealCheckoutAttemptStale(
  startedAt: unknown,
  now = utcNow()
): boolean {
  const startedAtMillis =
    startedAt instanceof Timestamp
      ? startedAt.toMillis()
      : startedAt instanceof Date
        ? startedAt.getTime()
        : null;

  return (
    startedAtMillis === null ||
    now.getTime() - startedAtMillis >= BAN_APPEAL_CHECKOUT_ATTEMPT_LEASE_MS
  );
}

/**
 * Converts Firestore Timestamp values to Date so JSON responses serialize
 * them as ISO strings (matching the former FastAPI behavior).
 */
function normalize(data: Record<string, unknown>): Doc {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(data)) {
    result[key] = value instanceof Timestamp ? value.toDate() : value;
  }
  return result as Doc;
}

/**
 * Thin Firestore data layer, ported from the FastAPI `FirestoreStore`.
 * Documents carry their own `id`, `created_at`, and `updated_at` fields.
 */
export const store = {
  async create(collection: string, payload: Record<string, unknown>): Promise<Doc> {
    const documentId = randomUUID();
    const now = utcNow();
    const document: Doc = {
      id: documentId,
      ...payload,
      created_at: now,
      updated_at: now
    };
    await adminFirestore().collection(collection).doc(documentId).set(document);
    return document;
  },

  async set(collection: string, documentId: string, payload: Record<string, unknown>): Promise<Doc> {
    const now = utcNow();
    const document: Doc = {
      id: documentId,
      ...payload,
      created_at: (payload.created_at as Date | undefined) ?? now,
      updated_at: now
    };
    await adminFirestore().collection(collection).doc(documentId).set(document, { merge: true });
    return document;
  },

  /** Returns the document, or null when it does not exist. */
  async get(collection: string, documentId: string): Promise<Doc | null> {
    const snapshot = await adminFirestore().collection(collection).doc(documentId).get();
    if (!snapshot.exists) return null;
    return normalize(snapshot.data() ?? {});
  },

  /** Updates an existing document; returns null when it does not exist. */
  async update(
    collection: string,
    documentId: string,
    payload: Record<string, unknown>
  ): Promise<Doc | null> {
    const documentRef = adminFirestore().collection(collection).doc(documentId);
    const snapshot = await documentRef.get();
    if (!snapshot.exists) return null;

    await documentRef.update({ ...payload, updated_at: utcNow() });
    const updatedSnapshot = await documentRef.get();
    return normalize(updatedSnapshot.data() ?? {});
  },

  async claimBanAppealCheckoutAttempt(
    appealId: string,
    proposedAttemptId: string,
    expectedSessionId?: string| null
  ): Promise<BanAppealCheckoutClaim | null> {
    const firestore = adminFirestore();
    const documentRef = firestore.collection("ban_appeals").doc(appealId);

    return firestore.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(documentRef);
      if (!snapshot.exists) return null;

      const appeal = snapshot.data() ?? {};
      const currentSessionId =
      typeof appeal.stripe_checkout_session_id === "string"
      ? appeal.stripe_checkout_session_id
      : null;

      if (
        appeal.status !== "payment_required" ||
        currentSessionId !== expectedSessionId
      ) {
        return null;
      }
      const pendingAttemptId = appeal.stripe_checkout_attempt_id;
      if (
        appeal.stripe_checkout_attempt_state === "pending" &&
        typeof pendingAttemptId === "string" &&
        !isBanAppealCheckoutAttemptStale(
          appeal.stripe_checkout_attempt_started_at
        )
      ) {
        return { attemptId: pendingAttemptId, owner: false };
      }

      const now = utcNow();
      transaction.update(documentRef, {
        stripe_checkout_attempt_id: proposedAttemptId,
        stripe_checkout_attempt_state: "pending",
        stripe_checkout_attempt_started_at: now,
        updated_at: now
      });
      return { attemptId: proposedAttemptId, owner: true };
    });
  },

  async completeBanAppealCheckoutAttempt(
    appealId: string,
    attemptId: string,
    stripeSessionId: string
  ): Promise<boolean> {
    const firestore = adminFirestore();
    const documentRef = firestore.collection("ban_appeals").doc(appealId);

    return firestore.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(documentRef);
      if (!snapshot.exists) return false;

      const appeal = snapshot.data() ?? {};
      if (
        appeal.stripe_checkout_attempt_id !== attemptId ||
        appeal.stripe_checkout_attempt_state !== "pending"
      ) {
        return false;
      }

      transaction.update(documentRef, {
        stripe_checkout_session_id: stripeSessionId,
        stripe_checkout_attempt_state: "ready",
        updated_at: utcNow()
      });
      return true;
    });
  },

  async failBanAppealCheckoutAttempt(
    appealId: string,
    attemptId: string
  ): Promise<void> {
    const firestore = adminFirestore();
    const documentRef = firestore.collection("ban_appeals").doc(appealId);

    await firestore.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(documentRef);
      if (!snapshot.exists) return;

      const appeal = snapshot.data() ?? {};
      if (
        appeal.stripe_checkout_attempt_id === attemptId &&
        appeal.stripe_checkout_attempt_state === "pending"
      ) {
        transaction.update(documentRef, {
          stripe_checkout_attempt_state: "failed",
          updated_at: utcNow()
        });
      }
    });
  },
  async failBanAppealCheckoutSession(
    appealId: string,
    stripeSessionId: string
  ): Promise<boolean> {
    const firestore = adminFirestore();
    const documentRef = firestore.collection("ban_appeals")
    .doc(appealId);
    return firestore.runTransaction(
    async (transaction) => {
      const snapshot =
        await transaction.get(documentRef);

      if (!snapshot.exists) {
        return false;
      }

      const appeal = snapshot.data() ?? {};

      if (
        appeal.status !== "payment_required" ||
        appeal.stripe_checkout_session_id !==
          stripeSessionId
      ) {
        return false;
      }

      transaction.update(documentRef, {
        stripe_checkout_attempt_state: "failed",
        updated_at: utcNow()
      });

      return true;
    }
  );
},

  async waitForBanAppealCheckoutAttempt(
    appealId: string,
    attemptId: string
  ): Promise<string | null> {
    for (let check = 0; check < 50; check += 1) {
      const appeal = await this.get("ban_appeals", appealId);
      if (
        !appeal ||
        appeal.stripe_checkout_attempt_id !== attemptId ||
        appeal.stripe_checkout_attempt_state === "failed"
      ) {
        return null;
      }
      if (
        appeal.stripe_checkout_attempt_state === "ready" &&
        typeof appeal.stripe_checkout_session_id === "string"
      ) {
        return appeal.stripe_checkout_session_id;
      }

      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    return null;
  },

  async findByField(
    collection: string,
    field: string,
    value: unknown,
    limit = 25
  ): Promise<Doc[]> {
    const snapshots = await adminFirestore()
      .collection(collection)
      .where(field, "==", value)
      .limit(limit)
      .get();
    return snapshots.docs.map((snapshot) => normalize(snapshot.data() ?? {}));
  },

  async listQueue(limit = 25): Promise<Doc[]> {
    const snapshots = await adminFirestore()
      .collection("queue_entries")
      .where("status", "==", "queued")
      .orderBy("priority_score", "desc")
      .limit(limit)
      .get();
    return snapshots.docs.map((snapshot) => normalize(snapshot.data() ?? {}));
  }
};
