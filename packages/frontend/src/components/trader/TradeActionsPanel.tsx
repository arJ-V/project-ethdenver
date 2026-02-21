import { useMemo, useState } from "react";
import { writeOption } from "../../lib/tradingApi";
import type { RwaAsset } from "../../data/assets";
import type { WriteOptionRequest, WriteOptionResponse } from "../../lib/types";

interface TradeActionsPanelProps {
  asset: RwaAsset;
  onSubmitted: (result: WriteOptionResponse) => void;
  bare?: boolean;
}

function defaultExpiry() {
  return String(Math.floor((Date.now() + 24 * 60 * 60 * 1000) / 1000));
}

export function TradeActionsPanel({ asset, onSubmitted, bare = false }: TradeActionsPanelProps) {
  const [form, setForm] = useState<WriteOptionRequest>({
    buyer: "",
    amount: "1000",
    strike: "500",
    expiry: defaultExpiry(),
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<WriteOptionResponse | null>(null);

  const isValid = useMemo(
    () => Boolean(form.buyer && form.amount && form.strike && form.expiry),
    [form.buyer, form.amount, form.strike, form.expiry],
  );

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!isValid) return;
    setIsSubmitting(true);
    setError(null);
    try {
      const response = await writeOption(form);
      setResult(response);
      onSubmitted(response);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Trade submission failed");
    } finally {
      setIsSubmitting(false);
    }
  }

  const content = (
    <>
      <div className="panel-header">
        <h2 className="panel-title">Trade Options</h2>
      </div>

      <p className="muted">Submit covered-call instructions for {asset.symbol} through `/write-option`.</p>
      <form className="trade-form" onSubmit={handleSubmit}>
        <label>
          Buyer Wallet
          <input
            value={form.buyer}
            onChange={(event) => setForm((prev) => ({ ...prev, buyer: event.target.value.trim() }))}
            placeholder="0x..."
            required
          />
        </label>
        <label>
          Amount
          <input
            value={form.amount}
            onChange={(event) => setForm((prev) => ({ ...prev, amount: event.target.value }))}
            inputMode="numeric"
            required
          />
        </label>
        <label>
          Strike
          <input
            value={form.strike}
            onChange={(event) => setForm((prev) => ({ ...prev, strike: event.target.value }))}
            inputMode="numeric"
            required
          />
        </label>
        <label>
          Expiry (unix)
          <input
            value={form.expiry}
            onChange={(event) => setForm((prev) => ({ ...prev, expiry: event.target.value }))}
            inputMode="numeric"
            required
          />
        </label>
        <button type="submit" disabled={isSubmitting || !isValid}>
          {isSubmitting ? "Submitting..." : "Submit Option"}
        </button>
      </form>

      {error ? <p className="status status-error">{error}</p> : null}
      {result ? (
        <div className="trade-result">
          <p>Option {result.optionId} created.</p>
          <p className="muted">tx: {result.txHash}</p>
        </div>
      ) : null}
    </>
  );

  if (bare) return <div className="trade-form-wrap">{content}</div>;

  return <section className="panel trader-panel trade-panel">{content}</section>;
}
