import { useState } from "react";
import { Check, Trash2 } from "lucide-react";
import { CURRENCY_LIST, type CurrencyCode } from "@/lib/CurrencyContext";
import {
  Modal,
  ModalFooter,
  FormField,
  SelectInput,
  TextInput,
} from "@/components/ui";
import type { Holding } from "@quro/shared";

type EditHoldingModalProps = {
  existing?: Holding;
  onClose: () => void;
  onSave: (h: Holding, initialBuy?: { shares: number; price: number; date: string }) => void;
  onDelete?: (id: number) => void;
};

export function EditHoldingModal({ existing, onClose, onSave, onDelete }: EditHoldingModalProps) {
  const [form, setForm] = useState({
    name: existing?.name ?? "",
    ticker: existing?.ticker ?? "",
    currency: (existing?.currency ?? "EUR") as CurrencyCode,
    sector: existing?.sector ?? "ETF",
    currentPrice: existing?.currentPrice.toString() ?? "",
    initShares: "",
    initPrice: "",
    initDate: new Date().toISOString().slice(0, 10),
  });
  const [errors, setErrors] = useState<Record<string, string>>({});

  function set(field: string, value: string): void {
    setForm((previous) => ({ ...previous, [field]: value }));
    setErrors((previous) => ({ ...previous, [field]: "" }));
  }

  function handleSave() {
    const errs: Record<string, string> = {};
    if (!form.name.trim()) errs.name = "Required";
    if (!form.ticker.trim()) errs.ticker = "Required";
    if (!form.currentPrice || isNaN(parseFloat(form.currentPrice))) errs.currentPrice = "Required";

    if (!existing) {
      if (!form.initShares || isNaN(parseFloat(form.initShares)) || parseFloat(form.initShares) <= 0) {
        errs.initShares = "Required";
      }
      if (!form.initPrice || isNaN(parseFloat(form.initPrice)) || parseFloat(form.initPrice) <= 0) {
        errs.initPrice = "Required";
      }
    }

    if (Object.keys(errs).length > 0) {
      setErrors(errs);
      return;
    }

    const holding: Holding = {
      id: existing?.id ?? Date.now(),
      name: form.name.trim(),
      ticker: form.ticker.trim().toUpperCase(),
      currentPrice: parseFloat(form.currentPrice),
      currency: form.currency,
      sector: form.sector || "Other",
    };

    onSave(
      holding,
      !existing
        ? {
          shares: parseFloat(form.initShares),
          price: parseFloat(form.initPrice),
          date: form.initDate,
        }
        : undefined,
    );
    onClose();
  }

  const deleteButton = existing && onDelete ? (
    <button
      onClick={() => {
        onDelete(existing.id);
        onClose();
      }}
      className="flex items-center gap-1.5 px-3 py-2.5 rounded-xl border border-rose-200 text-rose-500 hover:bg-rose-50 text-sm transition-colors"
      title="Delete holding"
    >
      <Trash2 size={14} />
    </button>
  ) : undefined;

  return (
    <Modal
      title={existing ? "Edit Holding" : "Add Holding"}
      subtitle={existing ? "Update details" : "Add a stock, ETF or fund"}
      onClose={onClose}
      footer={
        <ModalFooter
          onCancel={onClose}
          onConfirm={handleSave}
          confirmLabel={existing ? "Save Changes" : "Add Holding"}
          danger={deleteButton}
        />
      }
    >
      <div className="grid grid-cols-2 gap-4">
        <FormField label="Security Name" required error={errors.name} className="col-span-2">
          <TextInput
            value={form.name}
            onChange={(value) => set("name", value)}
            error={!!errors.name}
            placeholder="e.g. Vanguard FTSE All-World"
          />
        </FormField>

        <FormField label="Ticker" required error={errors.ticker}>
          <TextInput
            value={form.ticker}
            onChange={(value) => set("ticker", value)}
            error={!!errors.ticker}
            placeholder="VWCE"
          />
        </FormField>

        <FormField label="Sector">
          <TextInput
            value={form.sector}
            onChange={(value) => set("sector", value)}
            placeholder="ETF, Tech, Finance..."
          />
        </FormField>

        <FormField label="Currency">
          <SelectInput
            value={form.currency}
            onChange={(value) => set("currency", value)}
            options={CURRENCY_LIST}
          />
        </FormField>

        <FormField label="Current Price" required error={errors.currentPrice}>
          <TextInput
            type="number"
            step="0.01"
            value={form.currentPrice}
            onChange={(value) => set("currentPrice", value)}
            error={!!errors.currentPrice}
            placeholder="112.50"
          />
        </FormField>
      </div>

      {!existing && (
        <div className="border-t border-dashed border-slate-200 pt-4">
          <p className="text-xs font-semibold text-slate-600 mb-3">Initial Buy Transaction</p>
          <div className="grid grid-cols-3 gap-3">
            <FormField label="Shares" required error={errors.initShares}>
              <TextInput
                type="number"
                step="0.0001"
                value={form.initShares}
                onChange={(value) => set("initShares", value)}
                error={!!errors.initShares}
                placeholder="50"
              />
            </FormField>
            <FormField label="Buy Price" required error={errors.initPrice}>
              <TextInput
                type="number"
                step="0.01"
                value={form.initPrice}
                onChange={(value) => set("initPrice", value)}
                error={!!errors.initPrice}
                placeholder="98.20"
              />
            </FormField>
            <FormField label="Date">
              <input
                type="date"
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
                value={form.initDate}
                onChange={(event) => set("initDate", event.target.value)}
              />
            </FormField>
          </div>

          {form.initShares && form.initPrice && (
            <div className="mt-3 bg-emerald-50 border border-emerald-100 rounded-xl p-3 flex items-center gap-2">
              <Check size={13} className="text-emerald-600" />
              <span className="text-xs text-emerald-700">
                Initial position: {form.initShares} shares @ {form.currency} {form.initPrice} = {form.currency}{" "}
                {(parseFloat(form.initShares) * parseFloat(form.initPrice)).toFixed(2)}
              </span>
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}
