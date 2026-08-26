import { Check, Crown } from "lucide-react";
import type { AppSettings, PaymentPackage, PaymentSale } from "../../../shared/domain/models";

const period = (type: PaymentPackage["type"], locale: AppSettings["locale"]) => {
  if (type === "free") return locale === "vi" ? "miễn phí" : "free";
  if (type === "monthly") return locale === "vi" ? "/ tháng" : "/ month";
  if (type === "annual") return locale === "vi" ? "/ năm" : "/ year";
  return locale === "vi" ? "thanh toán một lần" : "one-time payment";
};

export function PaymentPackagesPreview({ items, locale, sale }: { items: PaymentPackage[]; locale: AppSettings["locale"]; sale?: PaymentSale }) {
  const formatter = new Intl.NumberFormat(locale, { style: "currency", currency: "VND", maximumFractionDigits: 0 });
  return <div className="payment-package-preview" aria-label={locale === "vi" ? "Xem trước các gói" : "Package preview"}>
    {items.map((item) => { const applicableSale = sale?.packageIds.includes(item.id) && item.price.amount > 0 ? sale : undefined; const amount = applicableSale ? Math.round(item.price.amount * (100 - applicableSale.discountPercent) / 100) : item.price.amount; return <article className="payment-package-card-shell" key={item.id}>
      <div className="payment-package-sale-slot">{applicableSale && <div className="payment-package-sale"><span>{applicableSale.name[locale]}</span><strong>{locale === "vi" ? "Giảm" : "Save"} {applicableSale.discountPercent}%</strong></div>}</div>
      <div className={`payment-package-card ${item.type !== "free" ? "featured" : ""}`}>
        <div className="payment-package-card-heading"><div><h2>{item.name[locale]}</h2><p>{item.info[locale]}</p></div><Crown aria-hidden="true" /></div>
        <div className="payment-package-price"><del className={applicableSale ? "" : "is-placeholder"} aria-hidden={!applicableSale}>{applicableSale ? formatter.format(item.price.amount) : "—"}</del><strong>{formatter.format(amount)}</strong><span>{period(item.type, locale)}</span></div>
        <ul>{item.benefits[locale].map((benefit) => <li key={benefit}><span><Check aria-hidden="true" /></span>{benefit}</li>)}</ul>
        {item.type !== "free" && <button type="button" disabled>{locale === "vi" ? "Đăng ký ngay" : "Subscribe now"}</button>}
      </div>
    </article>; })}
  </div>;
}
