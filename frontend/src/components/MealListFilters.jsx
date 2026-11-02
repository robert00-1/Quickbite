export default function MealListFilters({ pagination, label }) {
  return <div className="mb-4 flex flex-col gap-3 sm:flex-row">
    <input type="search" aria-label={`Search ${label}`} placeholder="Search meals..." value={pagination.search} onChange={(event) => pagination.setSearch(event.target.value)} className="min-w-0 flex-1 rounded-lg border border-gray-200 bg-white px-3 py-2 outline-none focus:border-red-500" />
    <select aria-label={`${label} category`} value={pagination.category} onChange={(event) => pagination.setCategory(event.target.value)} className="rounded-lg border border-gray-200 bg-white px-3 py-2 outline-none focus:border-red-500">
      <option value="All">All categories</option>
      {pagination.categories.map((category) => <option key={category}>{category}</option>)}
    </select>
  </div>;
}
