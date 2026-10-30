import test from "node:test";
import assert from "node:assert/strict";
import { planShipment } from "./shipment_cutover.ts";

test("a delivery without proof stays on the incumbent path", () => {
  const result = planShipment({ domain: "send.example.com", shipment: { trackingNumber: "LX-2048", event: "delivered" } });
  assert.deepEqual(result, { publish: false, reason: "delivered needs proof of delivery" });
});

test("a delivery with proof can enter the DNS cutover", () => {
  const result = planShipment({ domain: "send.example.com", shipment: { trackingNumber: "LX-2048", event: "delivered", proofOfDelivery: "pod/2048.pdf" } });
  assert.equal(result.publish, true);
});
