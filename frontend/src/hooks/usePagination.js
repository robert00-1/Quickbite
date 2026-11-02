import { useEffect, useState } from "react";

export default function usePagination(items, resetKey = "", perPage = 10) {
  const [requestedPage, setPage] = useState(1);
  const totalPages = Math.max(1, Math.ceil(items.length / perPage));
  const page = Math.min(requestedPage, totalPages);
  useEffect(() => { setPage(1); }, [resetKey]);
  useEffect(() => { setPage((current) => Math.min(current, totalPages)); }, [totalPages]);
  return {page, setPage, perPage, total: items.length, totalPages, items: items.slice((page - 1) * perPage, page * perPage)};
}
