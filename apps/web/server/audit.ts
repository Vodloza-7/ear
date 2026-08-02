
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
 type auditCallStartedInput={
    sessionId?:string,
    userId?:string,
    started_at?: Date,
    status?:string
 }
 type auditCallStartedRecord={
    timestamp: string;
    correlationId: string;
    level: "info";
    component:"calls"
    auditEventType: "call_started";
    sessionId:string | null;
    userId:string | null;
    started_at:Date | null;
    status: string | null;
 }
 export function auditCallStarted(
    input:auditCallStartedInput,):
    auditCallStartedRecord{
    const auditRecord: auditCallStartedRecord={
    timestamp:new Date().toISOString(),
    correlationId:crypto.randomUUID(),
    level: "info",
    component:"calls",
    auditEventType: "call_started",
    sessionId:input.sessionId??null,
    userId: input.userId??null,
    started_at: input.started_at ?? null,
    status: input.status ?? null
    };
console.info(JSON.stringify(auditRecord));
return auditRecord;
    }

 type auditCallEndedInput={
    sessionId?:string,
    userId?:string,
    status?:string
 }
 type auditCallEndedRecord={
    timestamp: string;
    correlationId: string;
    level: "info";
    component:"calls"
    auditEventType: "call_ended";
    sessionId:string | null;
    userId:string | null;
    status: string | null;

 }
 export function auditCallEnded(
    input:auditCallEndedInput,):
    auditCallEndedRecord{
    const auditRecord: auditCallEndedRecord={
    timestamp:new Date().toISOString(),
    correlationId:crypto.randomUUID(),
    level: "info",
    component:"calls",
    auditEventType: "call_ended",
    sessionId:input.sessionId??null,
    userId: input.userId??null,
    status: input.status ?? null
    };
console.info(JSON.stringify(auditRecord));
return auditRecord;
    }
type auditRecordingStoredInput={
    sessionId?:string,
    providerRecordingId?:string |null,
    }
type auditRecordingStoredRecord={
    timestamp: string;
    correlationId: string;
    level: "info";
    component:"recordings"
    auditEventType: "recording_stored";
    sessionId:string | null;
    providerRecordingId:string | undefined | null;
}
export function auditRecordingStored(
    input:auditRecordingStoredInput,):
    auditRecordingStoredRecord{
    const auditRecord: auditRecordingStoredRecord={
    timestamp:new Date().toISOString(),
    correlationId:crypto.randomUUID(),
    level: "info",
    component:"recordings",
    auditEventType: "recording_stored",
    sessionId:input.sessionId??null,
    providerRecordingId: input.providerRecordingId ?? null,
 };
 console.info(JSON.stringify(auditRecord));
 return auditRecord;
 }
type auditBanCreatedInput={
    userId?:string,
    banType?:string,
    createdBy?:string,
    banId?:string,
}
type auditBanCreatedRecord={
    timestamp: string;
    correlationId: string;
    level: "info";
    component:"ban";
    auditEventType: "ban_created";
    userId:string | null;
    banType:string | null;
    createdBy:string | null;
    banId:string | null;
}
export function auditBanCreated(
    input:auditBanCreatedInput,):
    auditBanCreatedRecord{
    const auditRecord: auditBanCreatedRecord={
    timestamp:new Date().toISOString(),
    correlationId:crypto.randomUUID(),
    level: "info",
    component:"ban",
    auditEventType: "ban_created",
    userId:input.userId??null,
    banType: input.banType ?? null,
    createdBy: input.createdBy ?? null,
    banId: input.banId ?? null
};
console.info(JSON.stringify(auditRecord));
return auditRecord;
    }