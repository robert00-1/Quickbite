export default function Pagination({ page, totalPages, total, perPage = 10, setPage, label = "Items" }) {
  const pages = [...new Set([1, page - 1, page, page + 1, totalPages])].filter((number) => number >= 1 && number <= totalPages).sort((a, b) => a - b);
  const button = "min-w-9 rounded-lg border px-3 py-2 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-40";
  const inactive = `${button} border-gray-200 bg-white text-gray-700 hover:border-red-500 hover:text-red-600`;
  return <nav aria-label={`${label} pagination`} className="mt-5 flex flex-wrap items-center justify-between gap-3">
    <p className="text-sm text-gray-500" role="status">{total ? `Showing ${(page - 1) * perPage + 1}–${Math.min(page * perPage, total)} of ${total}` : "0 results"} · Page {page} of {totalPages}</p>
    <div className="flex max-w-full flex-wrap items-center gap-1.5">
      <button type="button" className={inactive} disabled={page === 1 || total === 0} onClick={() => setPage(page - 1)}>Previous</button>
      {pages.map((number, index) => <span className="flex items-center gap-1.5" key={number}>
        {index > 0 && number > pages[index - 1] + 1 && <span aria-hidden="true" className="px-1 text-gray-400">…</span>}
        <button type="button" aria-label={`Page ${number}`} aria-current={page === number ? "page" : undefined} onClick={() => setPage(number)} className={page === number ? `${button} border-red-500 bg-red-500 text-white` : inactive}>{number}</button>
      </span>)}
      <button type="button" className={inactive} disabled={page === totalPages || total === 0} onClick={() => setPage(page + 1)}>Next</button>
    </div>
  </nav>;
}
