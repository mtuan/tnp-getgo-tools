import { RefreshCw } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { AppSettings } from "../../../shared/domain/models";
import * as ui from "../../../shared/ui";
import en from "../../../shared/localization/en.json";
import vi from "../../../shared/localization/vi.json";
import { useAuth } from "../../authentication/components/AuthContext";
import type { MarketplaceTopicReview, MarketplaceTopicReviewPage } from "../domain/marketplace-reviews";

const PAGE_SIZE = 20;

export function TopicReviewsManager({ topicId, locale }: { topicId: string; locale: AppSettings["locale"] }) {
  const auth = useAuth();
  const toast = ui.useToast();
  const copy = (locale === "vi" ? vi : en).topicReviews;
  const [result, setResult] = useState<MarketplaceTopicReviewPage | null>(null);
  const [page, setPage] = useState(1);
  const [cursors, setCursors] = useState<Array<string | null>>([null]);
  const [loading, setLoading] = useState(true);
  const [clearing, setClearing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refresh, setRefresh] = useState(0);

  const load = useCallback(() => auth.requireAuth(async () => {
    setLoading(true);
    setError(null);
    try {
      setResult(await window.getgo.listMarketplaceTopicReviews({
        topicId,
        pageSize: PAGE_SIZE,
        ...(cursors[page - 1] ? { cursor: cursors[page - 1]! } : {}),
      }));
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : String(cause);
      setError(message);
      toast.show({ title: copy.loadFailed, description: message, variant: "error" });
    } finally {
      setLoading(false);
    }
  }), [auth.requireAuth, copy.loadFailed, cursors, page, toast, topicId]);

  useEffect(() => { void load(); }, [load, refresh]);

  const columns = useMemo<ui.DataColumn<MarketplaceTopicReview>[]>(() => [
    { key: "author", title: copy.author, render: (review) => <strong>{review.authorName}</strong> },
    { key: "rating", title: copy.rating, width: 100, render: (review) => `${review.rating} / 5` },
    { key: "comment", title: copy.comment, render: (review) => review.comment || <span className="ui-table-secondary">{copy.noComment}</span> },
    { key: "createdAt", title: copy.createdAt, width: 180, render: (review) => new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(new Date(review.createdAt)) },
  ], [copy, locale]);

  const clearAll = async () => auth.requireAuth(async () => {
    setClearing(true);
    try {
      const cleared = await window.getgo.clearMarketplaceTopicReviews(topicId);
      setResult({ items: [], nextCursor: null });
      setPage(1);
      setCursors([null]);
      toast.show({ title: copy.cleared, description: copy.clearedDescription.replace("{count}", String(cleared.deleted)), variant: "success" });
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : String(cause);
      toast.show({ title: copy.clearFailed, description: message, variant: "error" });
      throw cause;
    } finally {
      setClearing(false);
    }
  });

  return <>
    <ui.Panel className="topic-reviews-panel" title={copy.title} description={copy.description} meta={<ui.ControlGroup>
      <ui.Button icon={<RefreshCw />} loading={loading} disabled={clearing} onClick={() => setRefresh((value) => value + 1)}>{copy.refresh}</ui.Button>
      <ui.ConfirmPopover label={copy.clearAll} description={copy.clearConfirm} triggerLabel={copy.clearAll} confirmLabel={copy.clearAction} cancelLabel={copy.cancel} busy={clearing} disabled={loading || !result?.items.length} onConfirm={clearAll} />
    </ui.ControlGroup>}>
      <ui.PanelBody>
        {error && <ui.ErrorFrame message={error} />}
        <ui.DataTable horizontalScroll rows={result?.items ?? []} columns={columns} rowKey={(review) => review.id} ariaLabel={copy.title} emptyText={loading ? copy.loading : copy.empty} />
        <div className="topic-reviews-footer">
          <span>{copy.pageSize.replace("{count}", String(PAGE_SIZE))}</span>
          <ui.Pagination locale={locale} page={page} hasNextPage={Boolean(result?.nextCursor)} disabled={loading || clearing} onPageChange={(nextPage) => {
            if (nextPage > page) {
              if (!result?.nextCursor) return;
              setCursors((current) => [...current.slice(0, page), result.nextCursor]);
            }
            setPage(nextPage);
          }} />
        </div>
      </ui.PanelBody>
    </ui.Panel>
    <ui.ProcessingOverlay open={clearing} title={copy.clearing} description={copy.clearingDescription} />
  </>;
}
