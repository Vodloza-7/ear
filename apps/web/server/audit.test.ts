import { describe, expect, it, vi } from "vitest";

import { auditPaymentWebHookReceived } from "./audit";
import { auditQueueEntryCreated } from "./audit";
import { auditConsentRecordCreated   } from "./audit";
import { auditCallStarted } from "./audit";
import {auditCallEnded } from "./audit";

describe("auditPaymentWebhookReceived", () => {
  it("returns the expected structured audit fields", () => {
    const consoleSpy = vi
      .spyOn(console, "info")
      .mockImplementation(() => undefined);

    const result = auditPaymentWebHookReceived({
      sessionId: "session-123",
      stripeEventId: "evt-456",
      stripeEventType: "checkout.session.completed",
    });

    expect(result.level).toBe("info");
    expect(result.component).toBe("payment-webhook");
    expect(result.auditEventType).toBe(
      "payment_webhook_received",
    );

    expect(result.sessionId).toBe("session-123");
    expect(result.stripeEventId).toBe("evt-456");
    expect(result.stripeEventType).toBe(
      "checkout.session.completed",
    );

    expect(result.timestamp).toBeTruthy();
    expect(result.correlationId).toBeTruthy();

    expect(consoleSpy).toHaveBeenCalledOnce();

    consoleSpy.mockRestore();
  });

  it("does not include the full webhook payload or secrets", () => {
    const consoleSpy = vi
      .spyOn(console, "info")
      .mockImplementation(() => undefined);

    const result = auditPaymentWebHookReceived({
      sessionId: "session-123",
      stripeEventId: "evt-456",
      stripeEventType: "checkout.session.completed",
    });

    expect(result).not.toHaveProperty("payload");
    expect(result).not.toHaveProperty("stripe_signature");
    expect(result).not.toHaveProperty("webhook_secret");

    consoleSpy.mockRestore();
  });
});

describe("auditQueueEntryCreated", () => {
  it("returns the expected structured queue audit fields", () => {
    const consoleSpy = vi
      .spyOn(console, "info")
      .mockImplementation(() => undefined);

    const result = auditQueueEntryCreated({
      sessionId: "session-123",
      userId: "user-456",
      queueEntryId: "queue-789",
      priorityScore: 25,
    });

    expect(result.level).toBe("info");
    expect(result.component).toBe("queue");
    expect(result.auditEventType).toBe("queue_entry_created");
    expect(result.sessionId).toBe("session-123");
    expect(result.userId).toBe("user-456");
    expect(result.timestamp).toBeTruthy();
    expect(result.correlationId).toBeTruthy();
    expect(consoleSpy).toHaveBeenCalledOnce();

    consoleSpy.mockRestore();
  });

  it("does not include request bodies, tokens, or secrets", () => {
    const consoleSpy = vi
      .spyOn(console, "info")
      .mockImplementation(() => undefined);

    const result = auditQueueEntryCreated({
      sessionId: "session-123",
      userId: "user-456",
    });

    expect(result).not.toHaveProperty("payload");
    expect(result).not.toHaveProperty("requestBody");
    expect(result).not.toHaveProperty("token");
    expect(result).not.toHaveProperty("secret");

    consoleSpy.mockRestore();
  });
});

describe("auditConsentRecordCreated", () => {
  it("returns the expected consent record audit fields", () => {
    const consoleSpy = vi
      .spyOn(console, "info")
      .mockImplementation(() => undefined);

    const result = auditConsentRecordCreated({
      sessionId: "session-123",
      userId: "user-456",
      recordingConsented: true,
      termsConsented: true
    });

    expect(result.level).toBe("info");
    expect(result.component).toBe("consent");
    expect(result.auditEventType).toBe("consent_record_created");
    expect(result.sessionId).toBe("session-123");
    expect(result.userId).toBe("user-456");
    expect(result.timestamp).toBeTruthy();
    expect(result.correlationId).toBeTruthy();
    expect(consoleSpy).toHaveBeenCalledOnce();

    consoleSpy.mockRestore();
  });

  it("does not include request bodies, tokens, or secrets", () => {
    const consoleSpy = vi
      .spyOn(console, "info")
      .mockImplementation(() => undefined);

    const result = auditConsentRecordCreated({
      sessionId: "session-123",
      userId: "user-456",
      recordingConsented: true,
      termsConsented: true
    });

    expect(result).not.toHaveProperty("payload");
    expect(result).not.toHaveProperty("requestBody");
    expect(result).not.toHaveProperty("token");
    expect(result).not.toHaveProperty("secret");

    consoleSpy.mockRestore();
  });
});

describe("auditCallStarted", () => {
  it("returns the expected call started audit fields", () => {
    const consoleSpy = vi
      .spyOn(console, "info")
      .mockImplementation(() => undefined);

    const result= auditCallStarted({
      sessionId: "session-123",
      userId: "user-456",
      status: "active"
    });

    expect(result.level).toBe("info");
    expect(result.component).toBe("calls");
    expect(result.auditEventType).toBe("call_started");
    expect(result.sessionId).toBe("session-123");
    expect(result.userId).toBe("user-456");
    expect(result.status).toBe("active"),
    expect(result.timestamp).toBeTruthy();
    expect(result.correlationId).toBeTruthy();
    expect(consoleSpy).toHaveBeenCalledOnce();

    consoleSpy.mockRestore();
  });

  it("does not include request bodies, tokens, or secrets", () => {
    const consoleSpy = vi
      .spyOn(console, "info")
      .mockImplementation(() => undefined);

    const result = auditCallStarted({
      sessionId: "session-123",
      userId: "user-456"
    });

    expect(result).not.toHaveProperty("payload");
    expect(result).not.toHaveProperty("requestBody");
    expect(result).not.toHaveProperty("token");
    expect(result).not.toHaveProperty("secret");

    consoleSpy.mockRestore();
  });
});

describe("auditCallEnded", () => {
  it("returns the expected call ended audit fields", () => {
    const consoleSpy = vi
      .spyOn(console, "info")
      .mockImplementation(() => undefined);

    const result= auditCallEnded({
      sessionId: "session-123",
      userId: "user-456",
      status: "ended"
    });

    expect(result.level).toBe("info");
    expect(result.component).toBe("calls");
    expect(result.auditEventType).toBe("call_ended");
    expect(result.sessionId).toBe("session-123");
    expect(result.userId).toBe("user-456");
    expect(result.timestamp).toBeTruthy();
    expect(result.correlationId).toBeTruthy();
    expect(consoleSpy).toHaveBeenCalledOnce();


    consoleSpy.mockRestore();
  });

  it("does not include request bodies, tokens, or secrets", () => {
    const consoleSpy = vi
      .spyOn(console, "info")
      .mockImplementation(() => undefined);

    const result = auditCallEnded({
      sessionId: "session-123",
      userId: "user-456",
      status: "ended"
    });

    expect(result).not.toHaveProperty("payload");
    expect(result).not.toHaveProperty("requestBody");
    expect(result).not.toHaveProperty("token");
    expect(result).not.toHaveProperty("secret");

    consoleSpy.mockRestore();
  });
});
