import { Check, Crown } from "lucide-react";
import type { AppSettings, PaymentEvent, PaymentPackage } from "../../../shared/domain/models";
import en from "../../../shared/localization/en.json";
import vi from "../../../shared/localization/vi.json";
import {
  getGoConfigurableExperimentalFeatures,
  getGoConfigurableFeatures,
  type GetGoAccessPolicy,
  type GetGoConfigurablePackage,
} from "../domain/access-policy";

const period = (type: PaymentPackage["type"], locale: AppSettings["locale"]) => {
  if (type === "free") return locale === "vi" ? "miễn phí" : "free";
  if (type === "monthly") return locale === "vi" ? "/ tháng" : "/ month";
  if (type === "annual") return locale === "vi" ? "/ năm" : "/ year";
  return locale === "vi" ? "thanh toán một lần" : "one-time payment";
};

function interpolate(template: string, count: number) {
  return template.replace("{{count}}", String(count));
}

const packageTypeOrder: Record<PaymentPackage["type"], number> = {
  free: 0,
  monthly: 1,
  annual: 2,
  "one-time": 3,
};

export function orderedPreviewPackages(items: PaymentPackage[]): PaymentPackage[] {
  return items.map((item, index) => ({ item, index }))
    .sort((left, right) => packageTypeOrder[left.item.type] - packageTypeOrder[right.item.type] || left.index - right.index)
    .map(({ item }) => item);
}

export function accessPolicyBenefits(policy: GetGoAccessPolicy, tier: GetGoConfigurablePackage, locale: AppSettings["locale"]): string[] {
  const copy = (locale === "vi" ? vi : en).accessPolicy;
  const config = policy.packages[tier];
  const benefits = [
    config.studentLimit === -1 ? copy.unlimitedStudentsBenefit : interpolate(copy.studentLimitBenefit, config.studentLimit),
    config.topicLimitPerStudent === -1 ? copy.unlimitedTopicsBenefit : interpolate(copy.topicLimitBenefit, config.topicLimitPerStudent),
  ];
  for (const feature of getGoConfigurableFeatures) {
    if (config.features[feature]) benefits.push(copy[feature]);
  }
  for (const feature of getGoConfigurableExperimentalFeatures) {
    if (config.experimental[feature]) benefits.push(copy[feature]);
  }
  return benefits;
}

export function packageBenefits(policy: GetGoAccessPolicy, items: PaymentPackage[], locale: AppSettings["locale"]): Map<string, string[]> {
  const benefitsById = new Map(items.map(item => [
    item.id,
    accessPolicyBenefits(policy, item.type === "free" ? "free" : "premium", locale),
  ]));
  if (items.length < 2) return benefitsById;
  const commonBenefits = new Set(benefitsById.get(items[0].id) ?? []);
  for (const item of items.slice(1)) {
    const benefits = new Set(benefitsById.get(item.id) ?? []);
    for (const benefit of commonBenefits) {
      if (!benefits.has(benefit)) commonBenefits.delete(benefit);
    }
  }
  return new Map(Array.from(benefitsById, ([id, benefits]) => [
    id,
    benefits.filter(benefit => !commonBenefits.has(benefit)),
  ]));
}

export function PaymentPackagesPreview({ items, locale, sale, accessPolicy }: { items: PaymentPackage[]; locale: AppSettings["locale"]; sale?: Extract<PaymentEvent, { type: "sale" }>; accessPolicy: GetGoAccessPolicy }) {
  const formatter = new Intl.NumberFormat(locale, { style: "currency", currency: "VND", maximumFractionDigits: 0 });
  const orderedItems = orderedPreviewPackages(items);
  const benefitsById = packageBenefits(accessPolicy, orderedItems, locale);
  return <div className="payment-package-preview" aria-label={locale === "vi" ? "Xem trước các gói" : "Package preview"}>
    {orderedItems.map((item) => { const applicableSale = sale?.targets.packageIds.includes(item.id) && item.price.amount > 0 ? sale : undefined; const amount = applicableSale ? Math.round(item.price.amount * (100 - applicableSale.discountPercent) / 100) : item.price.amount; const benefits = benefitsById.get(item.id) ?? []; return <article className="payment-package-card-shell" key={item.id}>
      <div className="payment-package-sale-slot">{applicableSale && <div className="payment-package-sale"><span>{applicableSale.name[locale]}</span><strong>{locale === "vi" ? "Giảm" : "Save"} {applicableSale.discountPercent}%</strong></div>}</div>
      <div className={`payment-package-card ${item.type !== "free" ? "featured" : ""}`}>
        <div className="payment-package-card-heading"><div><h2>{item.name[locale]}</h2><p>{item.info[locale]}</p></div><Crown aria-hidden="true" /></div>
        <div className="payment-package-price"><del className={applicableSale ? "" : "is-placeholder"} aria-hidden={!applicableSale}>{applicableSale ? formatter.format(item.price.amount) : "—"}</del><strong>{formatter.format(amount)}</strong><span>{period(item.type, locale)}</span></div>
        <ul>{benefits.map((benefit) => <li key={benefit}><span><Check aria-hidden="true" /></span>{benefit}</li>)}</ul>
        {item.type !== "free" && <button type="button" disabled>{locale === "vi" ? "Đăng ký ngay" : "Subscribe now"}</button>}
      </div>
    </article>; })}
  </div>;
}
