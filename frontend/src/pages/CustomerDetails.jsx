import { useState } from "react";
import { useNavigate } from "react-router-dom";
import CustomerForm from "../components/customer/CustomerForm";
import { saveCustomer } from "../utils/orderHelpers";

function CustomerDetails() {
  const navigate = useNavigate();

  const [customer, setCustomer] = useState({
    fullName: "",
    phone: "",
    tableNumber: "",
  });

  const handleContinue = () => {
    console.log("Customer details:", customer);
    saveCustomer(customer);
    navigate("/checkout");
  };

  return (
    <div className="min-h-screen bg-gray-100 px-6 py-12">
      <div className="mx-auto max-w-4xl">
        <h1 className="mb-3 text-center text-4xl font-bold text-gray-800">
          Quick<span className="text-red-500">Bite</span>
        </h1>

        <p className="mb-10 text-center text-gray-600">
          Please enter your details to continue with your order.
        </p>

        <CustomerForm
          customer={customer}
          setCustomer={setCustomer}
          onContinue={handleContinue}
        />
      </div>
    </div>
  );
}

export default CustomerDetails;