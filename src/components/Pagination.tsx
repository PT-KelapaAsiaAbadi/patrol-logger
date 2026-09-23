import { useApp } from '../state';

interface Props { page: number; pageSize: number; total: number; onPage: (p: number) => void; busy?: boolean }

export function Pagination({ page, pageSize, total, onPage, busy }: Props) {
  const { t } = useApp();
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);

  return (
    <nav class="flex flex-wrap items-center justify-between gap-3 pt-3" aria-label={t('pageOf', { page, pages })}>
      <p class="text-muted tabular-nums">{t('showing', { from, to, total })}</p>
      <div class="flex items-center gap-2">
        <button type="button" class="btn btn-quiet" disabled={busy || page <= 1} onClick={() => onPage(page - 1)}>{t('prev')}</button>
        <span class="tabular-nums px-1">{t('pageOf', { page, pages })}</span>
        <button type="button" class="btn btn-quiet" disabled={busy || page >= pages} onClick={() => onPage(page + 1)}>{t('next')}</button>
      </div>
    </nav>
  );
}
