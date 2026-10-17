function Loading() {
  return (
    <main className="mx-auto flex min-h-[60vh] max-w-[1200px] items-center justify-center px-5 py-8">
      <div className="text-center">
        <div className="mx-auto mb-4 h-10 w-10 animate-spin rounded-full border-4 border-gray-200 border-t-red-500"></div>

        <p className="font-semibold text-gray-600">
          Loading menu...
        </p>
      </div>
    </main>
  );
}

export default Loading;