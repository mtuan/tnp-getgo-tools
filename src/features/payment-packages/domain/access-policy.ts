import { z } from "zod";

export const getGoConfigurableFeatures = [
  "feedback",
  "printing",
  "bilingualQuiz",
  "addStudent",
  "premiumContent",
  "questionNotes",
] as const;

export const getGoConfigurableExperimentalFeatures = ["experimentalTopics"] as const;

export type GetGoConfigurableFeature = typeof getGoConfigurableFeatures[number];
export type GetGoConfigurablePackage = "free" | "premium" | "admin";

const featureSchema = z.object(Object.fromEntries(
  getGoConfigurableFeatures.map((feature) => [feature, z.boolean()]),
) as Record<GetGoConfigurableFeature, z.ZodBoolean>);
const experimentalFeatureSchema = z.object({ experimentalTopics: z.boolean() });

const quotaSchema = z.preprocess(
  value => value === null ? -1 : value,
  z.union([z.literal(-1), z.number().int().positive()]),
);

const packagePolicySchema = z.object({
  studentLimit: quotaSchema,
  topicLimitPerStudent: quotaSchema,
  features: featureSchema,
  experimental: experimentalFeatureSchema,
});

export const getGoAccessPolicySchema = z.object({
  version: z.literal(1),
  packages: z.object({ free: packagePolicySchema, premium: packagePolicySchema, admin: packagePolicySchema }),
});

export type GetGoAccessPolicy = z.infer<typeof getGoAccessPolicySchema>;

export const defaultGetGoAccessPolicy: GetGoAccessPolicy = {
  version: 1,
  packages: {
    free: {
      studentLimit: 2,
      topicLimitPerStudent: 5,
      features: {
        feedback: true,
        printing: true,
        bilingualQuiz: true,
        addStudent: true,
        premiumContent: false,
        questionNotes: false,
      },
      experimental: { experimentalTopics: false },
    },
    premium: {
      studentLimit: -1,
      topicLimitPerStudent: 5,
      features: {
        feedback: true,
        printing: true,
        bilingualQuiz: true,
        addStudent: true,
        premiumContent: true,
        questionNotes: true,
      },
      experimental: { experimentalTopics: false },
    },
    admin: {
      studentLimit: -1,
      topicLimitPerStudent: -1,
      features: {
        feedback: true,
        printing: true,
        bilingualQuiz: true,
        addStudent: true,
        premiumContent: true,
        questionNotes: true,
      },
      experimental: { experimentalTopics: true },
    },
  },
};
