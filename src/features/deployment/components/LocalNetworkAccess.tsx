import { QRCodeSVG } from "qrcode.react";
import { ExternalLink } from "lucide-react";
import type { AppSettings } from "../../../shared/domain/models";
import en from "../../../shared/localization/en.json";
import vi from "../../../shared/localization/vi.json";

interface LocalNetworkAccessProps {
  locale: AppSettings["locale"];
  url: string;
}

export function LocalNetworkAccess({ locale, url }: LocalNetworkAccessProps) {
  const copy = (locale === "vi" ? vi : en).deployment;
  return <section className="local-network-access" aria-label={copy.networkAccessTitle}>
    <div className="local-network-qr" aria-hidden="true">
      <QRCodeSVG value={url} size={112} marginSize={2} level="M" />
    </div>
    <div>
      <strong>{copy.networkAccessTitle}</strong>
      <p>{copy.networkAccessDescription}</p>
      <a
        className="local-network-url"
        href={url}
        aria-label={copy.openNetworkAddress}
        title={copy.openNetworkAddress}
        onClick={event => {
          event.preventDefault();
          void window.getgo.openExternal(url);
        }}
      >
        <code>{url}</code>
        <ExternalLink aria-hidden="true" />
      </a>
    </div>
  </section>;
}
