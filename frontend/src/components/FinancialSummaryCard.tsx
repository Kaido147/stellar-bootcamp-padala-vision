import type { OrderRecord } from "@padala-vision/shared";
import { formatDateTime } from "../lib/format";
import { Card } from "./Card";
import { KeyValueList } from "./KeyValueList";

export function FinancialSummaryCard({ order }: { order: OrderRecord }) {
  return (
    <Card title="Financial Summary" subtitle="Backend workflow with chain-backed release finality.">
      <KeyValueList
        items={[
          { label: "Item amount", value: `${order.itemAmount} USDC` },
          { label: "Delivery fee", value: `${order.deliveryFee} USDC` },
          { label: "Escrow total", value: `${order.totalAmount} USDC` },
          { label: "Funded at", value: formatDateTime(order.fundedAt) },
          { label: "Released at", value: formatDateTime(order.releasedAt) },
          { label: "Contract", value: order.contractId ?? "Not attached by backend yet" },
        ]}
      />
    </Card>
  );
}
