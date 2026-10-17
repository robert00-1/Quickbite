import { jsPDF } from "jspdf";

function money(value) {
  return `KSh ${Number(value || 0).toLocaleString("en-KE", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function ReceiptPreview({ order, onClose }) {
  if (!order) return null;

  const receiptDate = order.createdAt
    ? new Date(order.createdAt).toLocaleString("en-KE")
    : new Date().toLocaleString("en-KE");

  const waiterName =
    order.assignedWaiterName ||
    order.servedByName ||
    "Not assigned";

  const downloadPDF = () => {
    const items = order.items || [];

    // Estimate receipt height to fit the complete order.
    const measureDoc = new jsPDF({
      orientation: "portrait",
      unit: "mm",
      format: [80, 300],
    });

    const preparedItems = items.map((item) => {
      const nameLines = measureDoc.splitTextToSize(
        `${item.quantity} x ${item.name}`,
        62
      );

      return { ...item, nameLines };
    });

    const itemsHeight = preparedItems.reduce(
      (height, item) => height + item.nameLines.length * 5 + 7,
      0
    );

    const receiptHeight = Math.max(155, 125 + itemsHeight);

    const doc = new jsPDF({
      orientation: "portrait",
      unit: "mm",
      format: [80, receiptHeight],
    });

    let y = 12;

    const divider = () => {
      doc.setLineDashPattern([1, 1], 0);
      doc.line(7, y, 73, y);
      doc.setLineDashPattern([], 0);
      y += 6;
    };

    const writeLine = (value, options = {}) => {
      const lines = doc.splitTextToSize(String(value), 66);
      doc.text(lines, options.x ?? 7, y, options);
      y += lines.length * 4.5;
    };

    doc.setFont("courier", "bold");
    doc.setFontSize(17);
    doc.text("QUICKBITE", 40, y, { align: "center" });
    y += 6;

    doc.setFontSize(9);
    doc.text("RESTAURANT POS RECEIPT", 40, y, {
      align: "center",
    });
    y += 5;

    doc.setFont("courier", "normal");
    doc.setFontSize(9);
    doc.text("ORDER READY", 40, y, { align: "center" });
    y += 7;

    divider();

    writeLine(`Order: #${order.id}`);
    writeLine(`Table: ${order.tableNumber ?? "—"}`);
    writeLine(`Customer: ${order.customerName || "Customer"}`);
    writeLine(`Date: ${receiptDate}`);
    writeLine(`Waiter: ${waiterName}`);

    y += 2;
    divider();

    doc.setFont("courier", "bold");
    doc.text("ITEM", 7, y);
    doc.text("AMOUNT", 73, y, { align: "right" });
    y += 6;

    doc.setFont("courier", "normal");

    preparedItems.forEach((item) => {
      doc.text(item.nameLines, 7, y);
      y += item.nameLines.length * 4.5;

      const quantityText = `${item.quantity} x ${money(item.price)}`;
      doc.text(quantityText, 7, y);

      doc.text(
        money(Number(item.price) * Number(item.quantity)),
        73,
        y,
        { align: "right" }
      );

      y += 7;
    });

    divider();

    doc.setFont("courier", "bold");
    doc.setFontSize(11);
    doc.text("TOTAL", 7, y);
    doc.text(money(order.total), 73, y, { align: "right" });
    y += 8;

    doc.setFont("courier", "normal");
    doc.setFontSize(9);
    writeLine(`Payment: ${order.paymentMethod || "—"}`);
    writeLine(`Payment status: ${order.paymentStatus || "—"}`);

    if (order.mpesaReceiptNumber) {
      writeLine(`M-Pesa: ${order.mpesaReceiptNumber}`);
    }

    y += 2;
    divider();

    doc.setFont("courier", "bold");
    doc.text("Thank you for dining with us!", 40, y, {
      align: "center",
    });

    doc.save(`QuickBite-POS-Receipt-${order.id}.pdf`);
  };

  return (
    <>
      <style>{`
        #quickbite-print-receipt {
          box-sizing: border-box;
        }

        @media print {
          body * {
            visibility: hidden !important;
          }

          #quickbite-print-receipt,
          #quickbite-print-receipt * {
            visibility: visible !important;
          }

          .receipt-no-print {
            display: none !important;
          }

          #quickbite-print-receipt {
            display: block !important;
            position: absolute !important;
            left: 0 !important;
            top: 0 !important;
            width: 72mm !important;
            max-width: none !important;
            margin: 0 !important;
            padding: 3mm !important;
            border: none !important;
            border-radius: 0 !important;
            box-shadow: none !important;
            color: #000 !important;
            background: #fff !important;
            font-family: monospace !important;
          }

          @page {
            size: 80mm auto;
            margin: 3mm;
          }
        }
      `}</style>

      <div className="fixed inset-0 z-[100] overflow-y-auto bg-slate-950/90 px-3 py-5 sm:px-6">
        <div className="mx-auto max-w-4xl">
          {/* Screen actions */}
          <div className="receipt-no-print mb-6 flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
            <div className="text-white">
              <h2 className="text-2xl font-bold sm:text-3xl">
                Order Ready
              </h2>
              <p className="mt-1 text-sm text-slate-300">
                POS receipt preview · Order #{order.id}
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={downloadPDF}
                className="rounded-lg bg-green-600 px-4 py-3 font-semibold text-white hover:bg-green-700"
              >
                Download PDF
              </button>

              <button
                type="button"
                onClick={() => window.print()}
                className="rounded-lg bg-blue-600 px-4 py-3 font-semibold text-white hover:bg-blue-700"
              >
                Print Receipt
              </button>

              <button
                type="button"
                onClick={onClose}
                className="rounded-lg bg-white px-4 py-3 font-semibold text-gray-900 hover:bg-gray-200"
              >
                Close
              </button>
            </div>
          </div>

          {/* Thermal POS paper */}
          <div className="flex justify-center">
            <section
              id="quickbite-print-receipt"
              className="w-full max-w-[360px] bg-white px-6 py-7 font-mono text-[13px] text-black shadow-2xl sm:px-7"
            >
              <header className="text-center">
                <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full border-2 border-black text-lg font-black">
                  QB
                </div>

                <h1 className="text-2xl font-black tracking-widest">
                  QUICKBITE
                </h1>

                <p className="mt-1 text-[11px] tracking-wider">
                  RESTAURANT POS RECEIPT
                </p>

                <div className="mt-3 inline-block border border-black px-3 py-1 text-[11px] font-bold">
                  ORDER READY
                </div>
              </header>

              <div className="my-5 border-t border-dashed border-black" />

              <div className="space-y-1 break-words text-[12px]">
                <p className="flex justify-between gap-3">
                  <span>ORDER</span>
                  <span className="font-bold">#{order.id}</span>
                </p>

                <p className="flex justify-between gap-3">
                  <span>TABLE</span>
                  <span>{order.tableNumber ?? "—"}</span>
                </p>

                <p className="flex justify-between gap-3">
                  <span>CUSTOMER</span>
                  <span className="text-right">
                    {order.customerName || "Customer"}
                  </span>
                </p>

                <p className="mt-2 text-[11px]">{receiptDate}</p>
              </div>

              <div className="my-5 border-t border-dashed border-black" />

              <div className="mb-3 grid grid-cols-[1fr_auto] gap-2 text-[11px] font-bold">
                <span>ITEM / QTY</span>
                <span>AMOUNT</span>
              </div>

              <div className="space-y-4">
                {(order.items || []).map((item, index) => (
                  <div key={`${order.id}-${item.id}-${index}`}>
                    <p className="break-words font-bold">
                      {item.name}
                    </p>

                    <div className="mt-1 flex justify-between gap-3 text-[12px]">
                      <span>
                        {item.quantity} × {money(item.price)}
                      </span>

                      <span className="whitespace-nowrap">
                        {money(
                          Number(item.price) * Number(item.quantity)
                        )}
                      </span>
                    </div>
                  </div>
                ))}
              </div>

              <div className="my-5 border-t border-dashed border-black" />

              <div className="flex justify-between gap-3 text-base font-black">
                <span>TOTAL</span>
                <span>{money(order.total)}</span>
              </div>

              <div className="my-5 border-t border-dashed border-black" />

              <div className="space-y-2 text-[12px]">
                <p className="flex justify-between gap-3">
                  <span>PAYMENT</span>
                  <span>{order.paymentMethod || "—"}</span>
                </p>

                <p className="flex justify-between gap-3">
                  <span>STATUS</span>
                  <span>{order.paymentStatus || "—"}</span>
                </p>

                {order.mpesaReceiptNumber && (
                  <p className="break-words">
                    M-Pesa Receipt: {order.mpesaReceiptNumber}
                  </p>
                )}
              </div>

              <div className="my-5 border-t border-dashed border-black" />

              <div className="text-center">
                <p className="text-[11px]">ASSIGNED WAITER</p>
                <p className="mt-1 break-words text-base font-black">
                  {waiterName}
                </p>

                <p className="mt-5 font-bold">
                  THANK YOU!
                </p>
                <p className="mt-1 text-[11px]">
                  We look forward to serving you again.
                </p>
              </div>

              <div className="mt-6 text-center text-[10px] tracking-widest">
                * * * QUICKBITE * * *
              </div>
            </section>
          </div>
        </div>
      </div>
    </>
  );
}

export default ReceiptPreview;