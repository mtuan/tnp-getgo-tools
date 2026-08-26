import { z } from "zod";

export const paymentSaleSchema = z.object({
  id: z.string().regex(/^[a-z][a-z0-9-]*$/),
  name: z.object({ en: z.string().min(1), vi: z.string().min(1) }),
  info: z.object({ en: z.string(), vi: z.string() }),
  recurrence: z.enum(["one-time", "yearly"]),
  startsOn: z.string().date(),
  endsOn: z.string().date(),
  discountPercent: z.number().min(1).max(100),
  packageIds: z.array(z.string()).min(1),
  enabled: z.boolean().default(true),
}).refine((value) => value.endsOn >= value.startsOn, { message: "Sale end date must not be before its start date.", path: ["endsOn"] });
export type PaymentSale = z.infer<typeof paymentSaleSchema>;
export const paymentSalesSchema = z.array(paymentSaleSchema);
