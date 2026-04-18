import { useMemo, useState } from "react";
import { Users, Plus, Info } from "lucide-react";
import { Input } from "./ui/input";
import { Button } from "./ui/button";
import { useApp } from "@/contexts/AppContext";
import {
  DEFAULT_CONSIGNOR_PCT,
  clampConsignorPct,
  splitSalePrice,
} from "@/utils/consignmentHelpers";
import { formatCurrency } from "@/utils/cardHelpers";

/**
 * Consignment toggle + form fields, shared between AddCardModal and
 * ManualCardEntry so we only maintain this UI once.
 *
 * Controlled component. The parent owns the state and passes in a value:
 *   {
 *     isConsigned: boolean,
 *     consignorId: string | null,
 *     consignorName: string,
 *     consignorContact: string,
 *     consignorPct: number,          // 0..100
 *     consignorMinimumPrice: number | null,
 *     agreementNotes: string,
 *   }
 *
 * onChange(patch) is called with the partial update.
 *
 * Pass `previewPrice` + `previewCurrency` to render a live split breakdown.
 */
export function ConsignmentFields({
  value,
  onChange,
  previewPrice = null,
  previewCurrency = "USD",
  disabled = false,
}) {
  const { consignors = [], addConsignor } = useApp();
  const [creatingNew, setCreatingNew] = useState(false);
  const [newName, setNewName] = useState("");
  const [newContact, setNewContact] = useState("");

  const {
    isConsigned = false,
    consignorId = null,
    consignorName = "",
    consignorContact = "",
    consignorPct = DEFAULT_CONSIGNOR_PCT,
    consignorMinimumPrice = null,
    agreementNotes = "",
  } = value || {};

  const patch = (updates) => onChange?.({ ...value, ...updates });

  const handleToggle = (checked) => {
    if (checked) {
      patch({ isConsigned: true, consignorPct: consignorPct || DEFAULT_CONSIGNOR_PCT });
    } else {
      patch({
        isConsigned: false,
        consignorId: null,
        consignorName: "",
        consignorContact: "",
        consignorPct: DEFAULT_CONSIGNOR_PCT,
        consignorMinimumPrice: null,
        agreementNotes: "",
      });
    }
  };

  const handlePickConsignor = (id) => {
    if (id === "__new__") {
      setCreatingNew(true);
      setNewName("");
      setNewContact("");
      return;
    }
    if (!id) {
      patch({ consignorId: null, consignorName: "", consignorContact: "" });
      return;
    }
    const c = consignors.find((x) => x.id === id);
    if (!c) return;
    patch({
      consignorId: c.id,
      consignorName: c.name || "",
      consignorContact: c.contact || "",
      consignorPct: c.defaultConsignorPct || consignorPct || DEFAULT_CONSIGNOR_PCT,
    });
  };

  const handleCreateConsignor = async () => {
    const name = newName.trim();
    if (!name) return;
    const id = await addConsignor({
      name,
      contact: newContact.trim(),
      defaultConsignorPct: consignorPct || DEFAULT_CONSIGNOR_PCT,
    });
    if (id) {
      patch({ consignorId: id, consignorName: name, consignorContact: newContact.trim() });
      setCreatingNew(false);
      setNewName("");
      setNewContact("");
    }
  };

  const preview = useMemo(() => {
    if (previewPrice == null || previewPrice === "" || Number.isNaN(Number(previewPrice))) {
      return null;
    }
    return splitSalePrice(Number(previewPrice), consignorPct);
  }, [previewPrice, consignorPct]);

  return (
    <div className="border-t pt-4">
      <label className="flex items-center gap-2 cursor-pointer">
        <input
          type="checkbox"
          checked={isConsigned}
          onChange={(e) => handleToggle(e.target.checked)}
          className="w-4 h-4"
          disabled={disabled}
        />
        <Users className="h-4 w-4" />
        <span className="font-semibold">Consigned (owned by someone else)</span>
      </label>

      {isConsigned && (
        <div className="space-y-4 pl-6 mt-3">
          <div className="text-xs text-muted-foreground flex items-start gap-1.5">
            <Info className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
            <span>
              Consigned items are tracked separately from your owned inventory.
              On sale, proceeds split between the consignor and you.
            </span>
          </div>

          {/* Consignor picker */}
          <div>
            <label className="block text-sm font-semibold mb-2">
              Consignor <span className="text-red-500">*</span>
            </label>
            {!creatingNew ? (
              <div className="flex gap-2">
                <select
                  value={consignorId || ""}
                  onChange={(e) => handlePickConsignor(e.target.value)}
                  className="flex-1 p-2 border rounded-md bg-white"
                  disabled={disabled}
                >
                  <option value="">Select consignor…</option>
                  {consignors.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                      {c.contact ? ` (${c.contact})` : ""}
                    </option>
                  ))}
                  <option value="__new__">+ Add new consignor</option>
                </select>
              </div>
            ) : (
              <div className="space-y-2 border rounded-md p-3 bg-gray-50">
                <Input
                  type="text"
                  placeholder="Consignor name"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  autoFocus
                />
                <Input
                  type="text"
                  placeholder="Contact (email, phone, @handle) — optional"
                  value={newContact}
                  onChange={(e) => setNewContact(e.target.value)}
                />
                <div className="flex gap-2">
                  <Button
                    type="button"
                    size="sm"
                    onClick={handleCreateConsignor}
                    disabled={!newName.trim()}
                  >
                    <Plus className="h-3.5 w-3.5 mr-1" />
                    Save consignor
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => setCreatingNew(false)}
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            )}
            {consignorName && !creatingNew && (
              <p className="text-xs text-muted-foreground mt-1">
                {consignorContact ? `Contact: ${consignorContact}` : "No contact on file"}
              </p>
            )}
          </div>

          {/* Split */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-semibold mb-2">
                Consignor's share (%) <span className="text-red-500">*</span>
              </label>
              <Input
                type="number"
                min="0"
                max="100"
                step="1"
                value={consignorPct}
                onChange={(e) =>
                  patch({ consignorPct: clampConsignorPct(e.target.value) })
                }
                disabled={disabled}
              />
              <p className="text-xs text-muted-foreground mt-1">
                Your commission: {(100 - clampConsignorPct(consignorPct)).toFixed(0)}%
              </p>
            </div>
            <div>
              <label className="block text-sm font-semibold mb-2">
                Consignor minimum price (optional)
              </label>
              <Input
                type="number"
                min="0"
                step="0.01"
                placeholder="Reserve price"
                value={consignorMinimumPrice ?? ""}
                onChange={(e) =>
                  patch({
                    consignorMinimumPrice:
                      e.target.value === "" ? null : Number(e.target.value),
                  })
                }
                disabled={disabled}
              />
              <p className="text-xs text-muted-foreground mt-1">
                Won't sell below this price
              </p>
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="block text-sm font-semibold mb-2">
              Agreement notes (optional)
            </label>
            <Input
              type="text"
              placeholder="e.g. 'return unsold after 60 days'"
              value={agreementNotes}
              onChange={(e) => patch({ agreementNotes: e.target.value })}
              disabled={disabled}
            />
          </div>

          {/* Live preview */}
          {preview && (
            <div className="rounded-md border border-blue-200 bg-blue-50 p-3 text-sm">
              <div className="font-semibold mb-1">
                If sold at {formatCurrency(Number(previewPrice), previewCurrency)}:
              </div>
              <div className="flex justify-between">
                <span>Consignor payout ({preview.consignorPct.toFixed(0)}%)</span>
                <span className="font-mono">
                  {formatCurrency(preview.consignorPayout, previewCurrency)}
                </span>
              </div>
              <div className="flex justify-between">
                <span>Your commission ({(100 - preview.consignorPct).toFixed(0)}%)</span>
                <span className="font-mono font-semibold text-green-700">
                  {formatCurrency(preview.vendorCommission, previewCurrency)}
                </span>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
