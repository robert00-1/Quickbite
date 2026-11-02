function CategoryFilter({
  categories,
  selectedCategory,
  onCategoryChange,
}) {
  return (
    <select
      aria-label="Menu category"
      value={selectedCategory}
      onChange={(event) => onCategoryChange(event.target.value)}
      className="w-full rounded-lg border-2 border-gray-200 bg-white px-4 py-3 text-gray-700 outline-none transition focus:border-red-500 sm:w-auto"
    >
      <option value="All">All Categories</option>

      {categories.filter((category) => category !== "All").map((category) => (
        <option key={category} value={category}>
          {category}
        </option>
      ))}
    </select>
  );
}

export default CategoryFilter;
