// One pager for the long admin lists (CP ease-of-use plan, phase 3 row 17):
// "Showing 26–50 of 300", then Previous / Page 2 of 12 / Next.
export const PAGE_SIZE = 25

export default function Pager({ page, pageSize = PAGE_SIZE, shown, total, note = '', onPage }) {
  const pageCount = Math.max(1, Math.ceil(total / pageSize))
  const first = (page - 1) * pageSize + 1
  return (
    <div className="cp-pager" role="navigation" aria-label="Pages">
      <span>{total ? `Showing ${first}–${first + shown - 1} of ${total}` : 'Showing 0'}{note}</span>
      {pageCount > 1 && (
        <>
          <button type="button" className="cp-btn cp-btn-sm cp-btn-outline" disabled={page <= 1} onClick={() => onPage(page - 1)}>Previous</button>
          <span>Page {page} of {pageCount}</span>
          <button type="button" className="cp-btn cp-btn-sm cp-btn-outline" disabled={page >= pageCount} onClick={() => onPage(page + 1)}>Next</button>
        </>
      )}
    </div>
  )
}
