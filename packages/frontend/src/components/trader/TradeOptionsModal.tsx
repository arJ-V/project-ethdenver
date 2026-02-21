import { X } from "lucide-react";
import type { OrderSnapshot } from "../../lib/types";
import type { RwaAsset } from "../../data/assets";
import { TradeActionsPanel } from "./TradeActionsPanel";

interface TradeOptionsModalProps {
  open: boolean;
  asset: RwaAsset;
  order: OrderSnapshot | null;
  lifecycleLoading: boolean;
  lifecycleError: string | null;
  onClose: () => void;
  onSubmitted: (optionId: string) => void;
}

export function TradeOptionsModal({
  open,
  asset,
  order,
  lifecycleLoading,
  lifecycleError,
  onClose,
  onSubmitted,
}: TradeOptionsModalProps) {
  if (!open) return null;

  return (
    <div className="trade-modal-overlay" role="dialog" aria-modal="true">
      <div className="trade-modal">
        <div className="trade-modal-header">
          <h3>Trade Options · {asset.symbol}</h3>
          <button type="button" aria-label="Close trade modal" onClick={onClose}>
            <X size={16} />
          </button>
        </div>

        <TradeActionsPanel
          asset={asset}
          bare
          onSubmitted={(result) => {
            onSubmitted(result.optionId);
          }}
        />

        <div className="trade-modal-lifecycle">
          <h4>Order Lifecycle</h4>
          {!order && !lifecycleLoading ? <p className="muted">Submit a trade to monitor lifecycle status.</p> : null}
          {lifecycleLoading ? <p className="muted">Syncing order timeline...</p> : null}
          {lifecycleError ? <p className="status status-error">{lifecycleError}</p> : null}
          {order ? (
            <div className="lifecycle-summary">
              <p>
                Option <strong>{order.optionId}</strong>
              </p>
              <p>
                Status <span className="status-pill">{order.statusLabel}</span>
              </p>
              <p className="muted">Writer: {order.writer}</p>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
