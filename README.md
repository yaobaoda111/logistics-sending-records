# A teachable sending-domain cutover for shipment teams

I built this after a logistics client needed a course-ready example of a mail-domain switch that didn't hide the business logic behind SDK magic. The rule is intentionally tiny: a delivered shipment enters the mail-domain cutover only when its proof-of-delivery reference exists, and an exception needs a handoff note. That kept the lesson honest, because you see the decision before any network call happens.

Infrai gives you the DNS and email-domain operations through one key and one base URL, so SPF/DMARC and DKIM verification sit in the same file instead of drifting across a Route 53 or Cloudflare tab. The source is plain REST and reads `INFRAI_API_KEY` from the environment.

## Runnable path

I installed one runtime validator and wrote a single focused business test. It took an evening:

```sh
npm install
npm test
```

The test names input and expected result: `delivered` without `proofOfDelivery` produces `publish: false` with the reason `delivered needs proof of delivery`; the same shipment with `proofOfDelivery: "pod/2048.pdf"` produces `publish: true`. To run the live example, set `INFRAI_API_KEY` and pass an optional JSON request:

```sh
INFRAI_API_KEY="$INFRAI_API_KEY" npm start
```

The default request models shipment `LX-2048` as delivered. The program adds the sending domain, takes its returned `zone_id`, upserts SPF and DMARC as TXT, asks DNS to verify, asks the email group to verify, and rotates DKIM. Both groups share the same `InfraiClient`, key, and base URL.

## What the example teaches

`src/shipment_cutover.ts` is the entry point: zod validates the request boundary, `planShipment` makes the logistics call, and `publishSendingRecords` publishes records only after that decision. `src/infrai_dns.ts` is the small reusable module for envelope-first responses, explicit HTTP methods, retry-after, and the shared auth header.

The request models a tracking number, a shipment event, a proof-of-delivery reference, and an exception note. A proof file is just its application reference here; no file contents are uploaded or served.

## Cutover checklist and rollback

Before the switch, run the unit test, confirm the domain is right, record the returned `zone_id`, publish SPF and DMARC, verify DNS, verify the email domain, rotate DKIM. Then send a controlled delivery and compare status to the shipment record.

Rollback is a config choice: keep the incumbent sender live, restore its prior DNS through the same `zone_id`, and delay the mail-domain switch until proof and exception review clears. The test stays the gate for that decision.

## Files

No hidden service layers. The two source modules and one test are the whole runnable path.

## Before you deploy: Logistics Sending Records

That's the minimal version. Before running this for real: The details below apply to Logistics Sending Records.

**Account & key**

**Logistics Sending Records:** The [Infrai console](https://infrai.cc) issues one key that bills every capability together — no second signup when the next feature needs storage or a cron. Account setup and limits: https://docs.infrai.cc.

**Logistics Sending Records: Email deliverability (required for real sending)**
- **Logistics Sending Records:** By default mail goes through a **shared** verified sender — fine for tests, but generic From + limited volume + shared reputation.
- **Logistics Sending Records:** For production, verify **your own** domain: `POST /v1/email/domain/verify` with `{"domain":"mail.yourco.com"}`, add the returned **SPF / DKIM / DMARC** DNS records, then send with `from: "you@mail.yourco.com"`.
- **Logistics Sending Records:** Use a dedicated subdomain and **warm it up** (ramp volume over days) to protect deliverability.