import { z } from "zod";
import type { PaymentEvent, PaymentPackage } from "../../../shared/domain/models.js";

export const paymentTargetEnvironments = ["development", "staging", "production"] as const;
export const paymentTargetEnvironmentSchema = z.enum(paymentTargetEnvironments);
export const paymentTargetEnvironmentsSchema = z.array(paymentTargetEnvironmentSchema)
  .min(1)
  .default([...paymentTargetEnvironments]);

export type PaymentTargetEnvironment = z.infer<typeof paymentTargetEnvironmentSchema>;

export function paymentPackagesForEnvironment(items: PaymentPackage[], environment: PaymentTargetEnvironment) {
  return items
    .filter((item) => item.targetEnvironments.includes(environment))
    .map(({ targetEnvironments: _targets, ...item }) => item);
}

export function paymentEventsForEnvironment(items: PaymentEvent[], environment: PaymentTargetEnvironment) {
  return items
    .filter((item) => item.targetEnvironments.includes(environment))
    .map((item) => {
      const { targetEnvironments: _targets, ...publishedEvent } = item;
      return publishedEvent;
    });
}
