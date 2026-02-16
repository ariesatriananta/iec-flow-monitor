"use client";

export function PrintToolbar() {
  return (
    <div className="no-print mb-6 flex items-center justify-end gap-2">
      <button
        type="button"
        onClick={() => window.history.back()}
        className="rounded border border-gray-300 px-3 py-2 text-sm"
      >
        Kembali
      </button>
      <button
        type="button"
        onClick={() => window.print()}
        className="rounded border border-black bg-black px-3 py-2 text-sm text-white"
      >
        Print
      </button>
    </div>
  );
}
