import { z } from "zod";
import { paymentTargetEnvironmentsSchema } from "./payment-environment.js";

const baseEventSchema = z.object({
  id: z.string().regex(/^[a-z][a-z0-9-]*$/),
  name: z.object({ en: z.string().min(1), vi: z.string().min(1) }),
  info: z.object({ en: z.string(), vi: z.string() }),
  recurrence: z.enum(["one-time", "yearly"]),
  startsOn: z.string().date(),
  endsOn: z.string().date(),
  enabled: z.boolean().default(true),
  targetEnvironments: paymentTargetEnvironmentsSchema,
}).refine((value) => value.endsOn >= value.startsOn, {
  message: "Event end date must not be before its start date.",
  path: ["endsOn"],
});

const saleEventSchema = z.object({
  type: z.literal("sale"),
  discountPercent: z.number().min(1).max(100),
  targets: z.object({ packageIds: z.array(z.string()).min(1) }),
});

const premiumPreviewEventSchema = z.object({
  type: z.literal("premium-preview"),
  premiumDays: z.number().int().min(1).max(365),
  targets: z.object({
    userTypes: z.array(z.enum(["new-registration", "legacy-migration"])).min(1),
    platforms: z.array(z.enum(["web", "ios", "android"])).min(1).default(["web", "ios", "android"]),
  }),
});

export const paymentEventSchema = z.intersection(
  baseEventSchema,
  z.discriminatedUnion("type", [saleEventSchema, premiumPreviewEventSchema]),
);
export type PaymentEvent = z.infer<typeof paymentEventSchema>;
type EventSchedule = Pick<PaymentEvent, "enabled" | "recurrence" | "startsOn" | "endsOn">;

export function paymentEventIsActive(event: EventSchedule, date = new Date()): boolean {
  if (!event.enabled) return false;
  const current = date.toISOString().slice(0, 10);
  if (event.recurrence === "one-time") return current >= event.startsOn && current <= event.endsOn;
  const day = current.slice(5); const start = event.startsOn.slice(5); const end = event.endsOn.slice(5);
  return start <= end ? day >= start && day <= end : day >= start || day <= end;
}
export const paymentEventsSchema = z.array(paymentEventSchema).superRefine((events, context) => {
  const seen = new Set<string>();
  events.forEach((event, index) => {
    if (seen.has(event.id)) context.addIssue({ code: z.ZodIssueCode.custom, message: `Event ID “${event.id}” must be unique.`, path: [index, "id"] });
    seen.add(event.id);
  });
});

export function suggestPaymentEventId(name: string, reservedIds: Iterable<string>): string {
  const base = name.normalize("NFKD").toLowerCase()
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48) || "event";
  const reserved = new Set(reservedIds);
  if (!reserved.has(base)) return base;
  for (let suffix = 2; ; suffix += 1) {
    const candidate = `${base.slice(0, 48 - String(suffix).length - 1)}-${suffix}`;
    if (!reserved.has(candidate)) return candidate;
  }
}
