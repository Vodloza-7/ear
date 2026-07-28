
type PaymentWebHookAuditInput={
    sessionId?:string,
    stripeEventId?:string,
    stripeEventType?:string,
}
type PaymentWebHookAuditRecord={
    timestamp: string;
    correlationId: string;
    level: "info";
    component:"payment-webhook";
    auditEventType: "payment_webhook_received";
    sessionId:string | null;
    stripeEventId:string | null;
    stripeEventType:string | null;
};
export function auditPaymentWebHookReceived(
    input:PaymentWebHookAuditInput,):
    PaymentWebHookAuditRecord{
    const auditRecord: PaymentWebHookAuditRecord={
    timestamp:new Date().toISOString(),
    correlationId:crypto.randomUUID(),
    level: "info",
    component:"payment-webhook",
    auditEventType: "payment_webhook_received",
    sessionId: input.sessionId ?? null,
    stripeEventId: input.stripeEventId ?? null,
    stripeEventType: input.stripeEventType ?? null,
  };
 console.info(JSON.stringify(auditRecord));
 return auditRecord;
 }

type QueueEntryCreatedAuditInput={
    sessionId?:string,
    userId?:string,
    queueEntryId?:string,
    priorityScore?:number,
}
type QueueEntryCreatedAuditRecord={
    timestamp: string;
    correlationId: string;
    level: "info";
    component:"queue";
    auditEventType: "queue_entry_created";
    sessionId:string | null;
    userId:string | null;
    queueEntryId:string | null;
    priorityScore:number | null;
};
export function auditQueueEntryCreated(
    input:QueueEntryCreatedAuditInput,):
    QueueEntryCreatedAuditRecord{
    const auditRecord: QueueEntryCreatedAuditRecord={
    timestamp:new Date().toISOString(),
    correlationId:crypto.randomUUID(),
    level: "info",
    component:"queue",
    auditEventType: "queue_entry_created",
    sessionId: input.sessionId ?? null,
    userId: input.userId ?? null,
    queueEntryId: input.queueEntryId ?? null,
    priorityScore: input.priorityScore ?? null,
  };
 console.info(JSON.stringify(auditRecord));
 return auditRecord;
 }
 type ConsentRecordCreatedAuditInput={
    sessionId?:string,
    userId?:string,
    recordingConsented?:boolean,
    termsConsented?:boolean,

}
type ConsentRecordCreatedAuditRecord={
    timestamp: string;
    correlationId: string;
    level: "info";
    component:"consent";
    auditEventType: "consent_record_created";
    sessionId:string | null;
    userId:string | null;
    recordingConsented:boolean | null;
    termsConsented:boolean | null;
}
export function auditConsentRecordCreated(
    input:ConsentRecordCreatedAuditInput,):
    ConsentRecordCreatedAuditRecord{
    const auditRecord: ConsentRecordCreatedAuditRecord={
    timestamp:new Date().toISOString(),
    correlationId:crypto.randomUUID(),
    level: "info",
    component:"consent",
    auditEventType: "consent_record_created",
    sessionId: input.sessionId ?? null,
    userId: input.userId ?? null,
    recordingConsented: input.recordingConsented ?? null,
    termsConsented: input.termsConsented ?? null,
  };
 console.info(JSON.stringify(auditRecord));
 return auditRecord;
 }