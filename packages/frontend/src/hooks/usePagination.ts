import { useState } from 'react';

export function usePagination<Item>(
  items: readonly Item[],
  pageSize: number,
  resetKey: string | number,
) {
  const totalPages = Math.max(1, Math.ceil(items.length / pageSize));
  const [state, setState] = useState({ resetKey, page: 1 });
  const page = state.resetKey === resetKey ? Math.min(state.page, totalPages) : 1;
  // Adjust only when the scope or page bounds change, before children render.
  if (state.resetKey !== resetKey || state.page !== page) setState({ resetKey, page });
  const pageStart = (page - 1) * pageSize;
  const pageItems = items.slice(pageStart, pageStart + pageSize);
  const handlePageChange = (next: number) =>
    setState({
      resetKey,
      page: Math.max(1, Math.min(totalPages, next)),
    });
  return {
    pageItems,
    totalPages,
    safeCurrentPage: page,
    rangeStart: items.length === 0 ? 0 : pageStart + 1,
    rangeEnd: pageStart + pageItems.length,
    handlePageChange,
  };
}
