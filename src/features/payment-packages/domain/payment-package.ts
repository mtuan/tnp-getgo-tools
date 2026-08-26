import { z } from "zod";

export const paymentPackageSchema = z.object({
  id: z.string().regex(/^[a-z][a-z0-9-]*$/),
  name: z.object({ en: z.string().min(1), vi: z.string().min(1) }),
  type: z.enum(["monthly", "annual", "one-time"]),
  info: z.object({ en: z.string(), vi: z.string() }),
  benefits: z.object({ en: z.array(z.string()), vi: z.array(z.string()) }),
  price: z.object({ amount: z.number().nonnegative(), currency: z.string().default("VND") }),
});
export type PaymentPackage = z.infer<typeof paymentPackageSchema>;
export const paymentPackagesSchema = z.array(paymentPackageSchema);
