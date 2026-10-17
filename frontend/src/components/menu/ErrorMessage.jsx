function ErrorMessage({ message }) {
  return (
    <main className="mx-auto flex min-h-[60vh] max-w-[1200px] items-center justify-center px-5 py-8">
      <div className="w-full max-w-md rounded-xl border-2 border-red-200 bg-white p-6 text-center shadow">
        <p className="font-semibold text-red-500">
          {message}
        </p>

        <p className="mt-2 text-sm text-gray-500">
          Please try again later.
        </p>
      </div>
    </main>
  );
}

export default ErrorMessage;
