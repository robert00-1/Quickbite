function CustomerForm({ customer, setCustomer, onContinue }) {
  const handleChange = (e) => {
    const { name, value } = e.target;

    setCustomer({
      ...customer,
      [name]: value,
    });
  };

  const handleSubmit = (e) => {
    e.preventDefault();

    if (!customer.fullName || !customer.phone || !customer.tableNumber) {
      alert("Please fill in all fields.");
      return;
    }

    if (!/^[A-Z][1-9][0-9]?$/.test(String(customer.tableNumber).trim().toUpperCase())) {
      alert("Use a table number such as A1 or B2.");
      return;
    }
    onContinue();
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="mx-auto max-w-lg rounded-2xl bg-white p-8 shadow-lg"
    >
      <h2 className="mb-6 text-2xl font-bold text-gray-800">
        Customer Details
      </h2>

      {/* Full Name */}
      <div className="mb-5">
        <label htmlFor="fullName" className="mb-2 block font-semibold text-gray-700">
          Full Name
        </label>

        <input
          type="text"
          name="fullName"
          id="fullName"
          required
          value={customer.fullName}
          onChange={handleChange}
          placeholder="Enter your full name"
          className="w-full rounded-lg border border-gray-300 px-4 py-3 outline-none focus:border-red-500"
        />
      </div>

      {/* Phone Number */}
      <div className="mb-5">
        <label htmlFor="phone" className="mb-2 block font-semibold text-gray-700">
          Phone Number
        </label>

        <input
          type="tel"
          name="phone"
          id="phone"
          required
          value={customer.phone}
          onChange={handleChange}
          placeholder="Enter your phone number"
          className="w-full rounded-lg border border-gray-300 px-4 py-3 outline-none focus:border-red-500"
        />
      </div>

      {/* Table Number */}
      <div className="mb-6">
        <label htmlFor="tableNumber" className="mb-2 block font-semibold text-gray-700">
          Table Number
        </label>

        <input
          type="text"
          name="tableNumber"
          id="tableNumber"
          required
          value={customer.tableNumber}
          onChange={handleChange}
          placeholder="e.g. A1 or B2"
          pattern="[A-Za-z][1-9][0-9]?"
          title="Use a table number such as A1 or B2"
          className="w-full rounded-lg border border-gray-300 px-4 py-3 outline-none focus:border-red-500 uppercase"
        />
      </div>

      <button
        type="submit"
        className="w-full rounded-lg bg-red-500 py-3 font-semibold text-white transition hover:bg-red-600"
      >
        Continue to Checkout →
      </button>
    </form>
  );
}

export default CustomerForm;