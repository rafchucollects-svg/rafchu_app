import { Input } from "@/components/ui/input";
import { createEmptyTransactionDetails } from "@/utils/transactionHelpers";

export function TransactionDetailsFields({ value, onChange, type = "transaction" }) {
  const details = value || createEmptyTransactionDetails(type);
  const update = (field, nextValue) => onChange({ ...details, [field]: nextValue });
  const completed = [
    details.transactionDate,
    details.counterpartyName,
    details.paymentMethod || type === "trade",
    details.documentNumber || details.documentUrl,
    type === "sale"
      ? details.taxTreatment !== "review_required"
      : details.marginSchemeEligibility !== "unreviewed",
  ].filter(Boolean).length;

  return (
    <details className="mb-4 rounded-xl border border-slate-200 bg-slate-50/70 p-3">
      <summary className="cursor-pointer select-none text-sm font-semibold text-slate-800">
        Tax &amp; receipt details
        <span className="ml-2 text-xs font-normal text-muted-foreground">
          {completed}/5 key fields · recommended before filing
        </span>
      </summary>
      <p className="mt-2 text-xs text-muted-foreground">
        These fields create the audit trail used by Tax Reporting. Missing details will be saved and flagged for review, not silently guessed.
      </p>
      <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
        <label className="text-xs font-medium">
          Transaction date
          <Input
            type="datetime-local"
            value={details.transactionDate || ""}
            onChange={(event) => update("transactionDate", event.target.value)}
            className="mt-1"
          />
        </label>
        <label className="text-xs font-medium">
          Counterparty / customer name
          <Input
            value={details.counterpartyName || ""}
            onChange={(event) => update("counterpartyName", event.target.value)}
            placeholder={type === "sale" ? "Customer or business" : "Seller or trader"}
            className="mt-1"
          />
        </label>
        <label className="text-xs font-medium">
          Counterparty type
          <select
            value={details.counterpartyType || "unknown"}
            onChange={(event) => update("counterpartyType", event.target.value)}
            className="mt-1 h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
          >
            <option value="unknown">Unknown / review later</option>
            <option value="private_individual">Private individual</option>
            <option value="business">Business</option>
            <option value="retail_customer">Retail customer</option>
          </select>
        </label>
        <label className="text-xs font-medium">
          Payment method
          <select
            value={details.paymentMethod || ""}
            onChange={(event) => update("paymentMethod", event.target.value)}
            className="mt-1 h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
          >
            <option value="">Select method</option>
            <option value="cash">Cash</option>
            <option value="card">Card</option>
            <option value="bank_transfer">Bank transfer</option>
            <option value="wise">Wise</option>
            <option value="mobilepay">MobilePay</option>
            <option value="paypal">PayPal</option>
            <option value="trade">Trade / barter</option>
            <option value="other">Other</option>
          </select>
        </label>
        <label className="text-xs font-medium">
          Receipt / invoice / voucher number
          <Input
            value={details.documentNumber || ""}
            onChange={(event) => update("documentNumber", event.target.value)}
            placeholder="e.g. PUR-2026-042"
            className="mt-1"
          />
        </label>
        <label className="text-xs font-medium">
          Payment reference
          <Input
            value={details.paymentReference || ""}
            onChange={(event) => update("paymentReference", event.target.value)}
            placeholder="Bank, terminal, or platform reference"
            className="mt-1"
          />
        </label>
        <label className="text-xs font-medium md:col-span-2">
          Margin-scheme eligibility
          <select
            value={details.marginSchemeEligibility || "unreviewed"}
            onChange={(event) => update("marginSchemeEligibility", event.target.value)}
            className="mt-1 h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
          >
            <option value="unreviewed">Not reviewed yet</option>
            <option value="eligible_private_seller">Eligible — bought from private seller</option>
            <option value="eligible_margin_scheme_supplier">Eligible — supplier used margin scheme</option>
            <option value="ineligible_normal_vat">Not eligible — normal VAT purchase</option>
            <option value="not_applicable">Not applicable</option>
          </select>
        </label>
        <label className="text-xs font-medium md:col-span-2">
          VAT treatment for this transaction
          <select
            value={details.taxTreatment || "review_required"}
            onChange={(event) => {
              const taxTreatment = event.target.value;
              onChange({
                ...details,
                taxTreatment,
                marginSchemeApplied: taxTreatment === "margin_scheme_second_hand" ? true : false,
              });
            }}
            className="mt-1 h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
          >
            <option value="review_required">Review later</option>
            <option value="margin_scheme_second_hand">Margin scheme — second-hand goods</option>
            <option value="standard_vat">Normal VAT</option>
            <option value="no_vat_private_purchase">Private purchase — no input VAT</option>
            <option value="not_applicable">Not applicable</option>
          </select>
        </label>
        <label className="text-xs font-medium md:col-span-2">
          Receipt / invoice URL
          <Input
            type="url"
            value={details.documentUrl || ""}
            onChange={(event) => update("documentUrl", event.target.value)}
            placeholder="https://…"
            className="mt-1"
          />
        </label>
        <label className="text-xs font-medium">
          Channel
          <Input
            value={details.channel || ""}
            onChange={(event) => update("channel", event.target.value)}
            placeholder="Store, event, Cardmarket…"
            className="mt-1"
          />
        </label>
        <label className="text-xs font-medium">
          Location
          <Input
            value={details.location || ""}
            onChange={(event) => update("location", event.target.value)}
            placeholder="City or online"
            className="mt-1"
          />
        </label>
        <label className="text-xs font-medium md:col-span-2">
          Counterparty address / IDs (when invoicing a business)
          <div className="mt-1 grid grid-cols-1 gap-2 md:grid-cols-3">
            <Input
              value={details.counterpartyAddress || ""}
              onChange={(event) => update("counterpartyAddress", event.target.value)}
              placeholder="Address"
            />
            <Input
              value={details.counterpartyBusinessId || ""}
              onChange={(event) => update("counterpartyBusinessId", event.target.value)}
              placeholder="Business ID"
            />
            <Input
              value={details.counterpartyVatId || ""}
              onChange={(event) => update("counterpartyVatId", event.target.value)}
              placeholder="VAT ID"
            />
          </div>
        </label>
      </div>
    </details>
  );
}
