import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { LogIn, Save } from "lucide-react";
import type { AppSettings } from "../../../shared/domain/models";
import * as ui from "../../../shared/ui";
import en from "../../../shared/localization/en.json";
import vi from "../../../shared/localization/vi.json";
import { useAuth } from "../../authentication/components/AuthContext";
import {
  getGoConfigurableFeatures,
  getGoConfigurableExperimentalFeatures,
  getGoAccessPolicySchema,
  type GetGoAccessPolicy,
  type GetGoConfigurablePackage,
} from "../domain/access-policy";

type FormValues = Record<string, unknown>;

function valuesFromPolicy(policy: GetGoAccessPolicy, tier: GetGoConfigurablePackage): FormValues {
  const current = policy.packages[tier];
  return {
    studentLimit: current.studentLimit,
    topicLimitPerStudent: current.topicLimitPerStudent,
    ...current.features,
    ...current.experimental,
  };
}

function policyFromValues(policy: GetGoAccessPolicy, tier: GetGoConfigurablePackage, values: FormValues): GetGoAccessPolicy {
  const features = Object.fromEntries(getGoConfigurableFeatures.map((feature) => [feature, values[feature] === true]));
  const experimental = Object.fromEntries(getGoConfigurableExperimentalFeatures.map((feature) => [feature, values[feature] === true]));
  return {
    ...policy,
    packages: {
      ...policy.packages,
      [tier]: {
        studentLimit: Number(values.studentLimit),
        topicLimitPerStudent: Number(values.topicLimitPerStudent),
        features,
        experimental,
      },
    },
  } as GetGoAccessPolicy;
}

export function AccessPolicyManager({ locale }: { locale: AppSettings["locale"] }) {
  const copy = (locale === "vi" ? vi : en).accessPolicy;
  const auth = useAuth();
  const toast = ui.useToast();
  const [tier, setTier] = useState<GetGoConfigurablePackage>("free");
  const [policy, setPolicy] = useState<GetGoAccessPolicy | null>(null);
  const [persisted, setPersisted] = useState<GetGoAccessPolicy | null>(null);
  const [busy, setBusy] = useState(false);
  const loadedUserId = useRef<string | null>(null);

  const load = useCallback(async () => {
    setBusy(true);
    try {
      const loaded = await window.getgo.loadGetGoAccessPolicy();
      setPolicy(loaded);
      setPersisted(structuredClone(loaded));
    } catch (error) {
      toast.show({ title: copy.loadFailed, description: String(error), variant: "error" });
    } finally {
      setBusy(false);
    }
  }, [copy.loadFailed, toast]);

  useEffect(() => {
    if (auth.loading || !auth.state.user) return;
    if (loadedUserId.current === auth.state.user.uid) return;
    loadedUserId.current = auth.state.user.uid;
    void load();
  }, [auth.loading, auth.state.user, load]);

  const fields = useMemo<ui.FormSchema[]>(() => [
    {
      section: copy.limits,
      description: copy.limitsDescription,
      fields: [[
        { type: "number", name: "studentLimit", label: copy.studentLimit, helper: copy.studentLimitHelper, min: -1, step: 1, presentation: "row", rules: { validate: value => Number.isInteger(value) && (Number(value) === -1 || Number(value) > 0) ? null : copy.quotaValidation } },
        { type: "number", name: "topicLimitPerStudent", label: copy.topicLimit, helper: copy.topicLimitHelper, min: -1, step: 1, presentation: "row", rules: { validate: value => Number.isInteger(value) && (Number(value) === -1 || Number(value) > 0) ? null : copy.quotaValidation } },
      ]],
    },
    {
      section: copy.features,
      description: copy.featuresDescription,
      fields: Array.from({ length: Math.ceil(getGoConfigurableFeatures.length / 2) }, (_, row) => row * 2).map(index => getGoConfigurableFeatures.slice(index, index + 2).map(feature => ({
          type: "toggle" as const,
          name: feature,
          label: copy[feature],
          helper: copy[`${feature}Helper` as keyof typeof copy],
          presentation: "row" as const,
        }))),
    },
    {
      section: copy.experimental,
      description: copy.experimentalDescription,
      fields: [getGoConfigurableExperimentalFeatures.map(feature => ({
        type: "toggle" as const,
        name: feature,
        label: copy[feature],
        helper: copy[`${feature}Helper` as keyof typeof copy],
        presentation: "row" as const,
      }))],
    },
  ], [copy]);

  const values = policy ? valuesFromPolicy(policy, tier) : {};
  const formErrors = policy ? ui.validateSchema(fields, values) : {};
  const dirty = policy !== null && persisted !== null && JSON.stringify(policy) !== JSON.stringify(persisted);
  const valid = policy !== null && Object.keys(formErrors).length === 0 && getGoAccessPolicySchema.safeParse(policy).success;
  const save = useCallback(async () => {
    if (!policy || !dirty || !valid) return;
    setBusy(true);
    try {
      const saved = await window.getgo.saveGetGoAccessPolicy(policy);
      setPolicy(saved);
      setPersisted(structuredClone(saved));
      toast.show({ title: copy.saved, variant: "success" });
    } catch (error) {
      toast.show({ title: copy.saveFailed, description: String(error), variant: "error" });
    } finally {
      setBusy(false);
    }
  }, [copy.saveFailed, copy.saved, dirty, policy, toast, valid]);
  ui.useSaveShortcut({ enabled: dirty && valid && !busy, onSave: () => void save() });

  if (!auth.loading && !auth.state.user) return <div className="access-policy-sign-in">
      <p>{copy.signInHint}</p>
      <ui.Button variant="solid" icon={<LogIn />} onClick={auth.requestLogin}>{copy.signIn}</ui.Button>
  </div>;
  if (!policy) return <ui.PageLoading label={copy.title} />;

  return <div className="access-policy-manager">
      <div className="access-policy-toolbar">
      <ui.Tabs<GetGoConfigurablePackage>
        value={tier}
        onChange={setTier}
        ariaLabel={copy.title}
        variant="segmented"
        items={[{ id: "free", label: copy.free }, { id: "premium", label: copy.premium }, { id: "admin", label: copy.admin }]}
      />
      <ui.Button variant="solid" icon={<Save />} loading={busy} disabled={!dirty || !valid} onClick={() => void save()}>{copy.save}</ui.Button>
      </div>
      <ui.Form
        fields={fields}
        values={values}
        errors={formErrors}
        autoFocus={false}
        onChange={(name, value) => setPolicy(current => current ? policyFromValues(current, tier, { ...valuesFromPolicy(current, tier), [name]: value }) : current)}
      />
  </div>;
}
