import { ExternalLink } from 'lucide-react';
import { Link } from 'react-router';

/**
 * The read-only marker of a row that another page's ledger owns: a link to that page, where the
 * row is edited. Used in `TxnRow`'s `readOnlyAction`.
 */
export function LedgerOwnerLink({ to, page }: Readonly<{ to: string; page: string }>) {
  return (
    <Link
      to={to}
      title={`Edit on the ${page} page`}
      aria-label={`Edit on the ${page} page`}
      className="flex items-center gap-1 rounded-sm text-label text-brand-fg hover:underline max-sm:min-h-11 max-sm:min-w-11 max-sm:justify-end focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus-ring"
    >
      {page} <ExternalLink size={12} aria-hidden />
    </Link>
  );
}
