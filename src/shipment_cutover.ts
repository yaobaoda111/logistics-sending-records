import { z } from "zod";
import { InfraiClient } from "./infrai_dns.ts";

const requestSchema = z.object({
  domain: z.string().min(1),
  shipment: z.object({
    trackingNumber: z.string().min(1),
    event: z.enum(["in_transit", "delivered", "exception"]),
    proofOfDelivery: z.string().optional(),
    exception: z.string().optional()
  })
});

export type CutoverRequest = z.infer<typeof requestSchema>;

export function planShipment(request: CutoverRequest): { publish: boolean; reason: string } {
  const parsed = requestSchema.parse(request);
  if (parsed.shipment.event === "exception" && !parsed.shipment.exception) {
    return { publish: false, reason: "exception needs a handoff note" };
  }
  if (parsed.shipment.event === "delivered" && !parsed.shipment.proofOfDelivery) {
    return { publish: false, reason: "delivered needs proof of delivery" };
  }
  return { publish: true, reason: "shipment evidence is complete" };
}

export async function publishSendingRecords(request: CutoverRequest): Promise<{ zone_id: string; verification: string }> {
  const parsed = requestSchema.parse(request);
  const decision = planShipment(parsed);
  if (!decision.publish) throw new Error(decision.reason);

  const infrai = new InfraiClient();
  const { zone_id } = await infrai.addDomain(parsed.domain);
  await infrai.upsertRecord({ zone_id, record_type: "TXT", name: "@", content: "v=spf1 include:send.example -all", ttl: 300 });
  await infrai.upsertRecord({ zone_id, record_type: "TXT", name: "_dmarc", content: "v=DMARC1; p=quarantine; rua=mailto:dmarc@example.com", ttl: 300 });
  await infrai.verifyDomain(parsed.domain);
  const email = await infrai.verifyEmailDomain(parsed.domain);
  await infrai.rotateDkim(parsed.domain);
  return { zone_id, verification: email.verification.status };
}

if (import.meta.main) {
  const input = process.argv[2] ? JSON.parse(process.argv[2]) : {
    domain: "send.example.com",
    shipment: { trackingNumber: "LX-2048", event: "delivered", proofOfDelivery: "pod/2048.pdf" }
  };
  console.log(JSON.stringify(await publishSendingRecords(input), null, 2));
}
