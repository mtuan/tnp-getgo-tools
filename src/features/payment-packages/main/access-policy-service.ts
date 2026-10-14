import type { FirebaseAuthService } from "../../authentication/main/firebase-auth.js";
import { decodeFirestoreValue } from "../../payment-orders/main/billing-order-read-service.js";
import {
  defaultGetGoAccessPolicy,
  getGoAccessPolicySchema,
  type GetGoAccessPolicy,
} from "../domain/access-policy.js";

type FirestoreValue = Record<string, unknown>;
type FirestoreDocument = { fields?: Record<string, FirestoreValue> };

function fieldValue(value: unknown): FirestoreValue {
  if (value === null) return { nullValue: null };
  if (typeof value === "string") return { stringValue: value };
  if (typeof value === "boolean") return { booleanValue: value };
  if (typeof value === "number") return Number.isInteger(value)
    ? { integerValue: String(value) }
    : { doubleValue: value };
  if (Array.isArray(value)) return { arrayValue: { values: value.map(fieldValue) } };
  if (value && typeof value === "object") return {
    mapValue: {
      fields: Object.fromEntries(Object.entries(value as Record<string, unknown>)
        .filter(([, item]) => item !== undefined)
        .map(([key, item]) => [key, fieldValue(item)])),
    },
  };
  throw new Error(`Unsupported access policy value: ${typeof value}`);
}

function decodeDocument(document: FirestoreDocument): unknown {
  return Object.fromEntries(Object.entries(document.fields ?? {})
    .map(([key, value]) => [key, decodeFirestoreValue(value)]));
}

function withPolicyDefaults(value: unknown): unknown {
  const record = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const packages = record.packages && typeof record.packages === "object"
    ? record.packages as Record<string, unknown>
    : {};
  const mergedPackages = Object.fromEntries(Object.entries(defaultGetGoAccessPolicy.packages).map(([tier, defaults]) => {
    const current = packages[tier] && typeof packages[tier] === "object"
      ? packages[tier] as Record<string, unknown>
      : {};
    const currentFeatures = current.features && typeof current.features === "object"
      ? current.features as Record<string, unknown>
      : {};
    const currentExperimental = current.experimental && typeof current.experimental === "object"
      ? current.experimental as Record<string, unknown>
      : {};
    const legacyExperimentalTopics = typeof currentFeatures.experimentalFeatures === "boolean"
      ? currentFeatures.experimentalFeatures
      : defaults.experimental.experimentalTopics;
    return [tier, {
      ...structuredClone(defaults),
      ...current,
      features: { ...defaults.features, ...currentFeatures },
      experimental: { ...defaults.experimental, experimentalTopics: legacyExperimentalTopics, ...currentExperimental },
    }];
  }));
  return {
    ...record,
    version: 1,
    packages: mergedPackages,
  };
}

export class GetGoAccessPolicyService {
  constructor(private readonly auth: FirebaseAuthService) {}

  async load(): Promise<GetGoAccessPolicy> {
    const { response } = await this.auth.firestoreRequest("/getgo-config/access-policy");
    if (response.status === 404) return structuredClone(defaultGetGoAccessPolicy);
    if (!response.ok) throw new Error(`Could not load access policy (HTTP ${response.status}).`);
    return getGoAccessPolicySchema.parse(withPolicyDefaults(decodeDocument(await response.json() as FirestoreDocument)));
  }

  async save(value: unknown): Promise<GetGoAccessPolicy> {
    const policy = getGoAccessPolicySchema.parse(value);
    const { response } = await this.auth.firestoreRequest("/getgo-config/access-policy", {
      method: "PATCH",
      body: JSON.stringify({ fields: Object.fromEntries(Object.entries(policy).map(([key, item]) => [key, fieldValue(item)])) }),
    });
    if (!response.ok) throw new Error(`Could not save access policy (HTTP ${response.status}).`);
    return getGoAccessPolicySchema.parse(decodeDocument(await response.json() as FirestoreDocument));
  }
}
