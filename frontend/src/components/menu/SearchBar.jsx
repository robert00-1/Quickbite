function SearchBar({ searchTerm, onSearch }) {
  return (
    <input
      type="text"
      placeholder="Search for a meal..."
      value={searchTerm}
      onChange={(event) => onSearch(event.target.value)}
      className="w-full rounded-lg border-2 border-gray-200 bg-white px-4 py-3 text-gray-700 outline-none transition placeholder:text-gray-400 focus:border-red-500"
    />
  );
}

export default SearchBar;