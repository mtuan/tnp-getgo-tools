import type { AppSettings } from "../../../shared/domain/models";
import * as ui from "../../../shared/ui";
import en from "../../../shared/localization/en.json";
import vi from "../../../shared/localization/vi.json";
import { AccessPolicyManager } from "../../payment-packages/components/AccessPolicyManager";

export function AccessPolicyPage({ locale }: { locale: AppSettings["locale"] }) {
  const copy = (locale === "vi" ? vi : en).accessPolicy;
  return <section>
    <ui.PageHeader title={copy.title} description={copy.description} />
    <AccessPolicyManager locale={locale} />
  </section>;
}
