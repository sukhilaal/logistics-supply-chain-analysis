# Executive Summary

The operation processed 10,000 shipments in the 12 months from August 2024 through July 2025. Recorded shipping cost totaled 92.88 million source currency units. The source provides no currency designation. The overall return rate was 10.41%, while 10.42% of shipments were labelled delayed and 4.86% were cancelled.

Average elapsed time from dispatch to delivery was 5.53 days (median 6) for the 9,514 shipments with a delivery date. A separate elapsed-time screen flags 2,930 shipments over seven days. This does not match the 1,042 `Delayed` status labels: 2,627 `Delivered` records also exceed seven elapsed days. Management should confirm the service-level definition behind `Delivery_Status` before using the seven-day threshold as an SLA.

## Areas to investigate

- **Warehouse returns:** Garcia Group Warehouse has a 17.84% return rate, 33 returns from 185 shipments, versus 10.41% overall. Review return reasons, product mix and destination mix before changing allocations.
- **Delivery mode:** Rail has an 11.15% return rate, higher than Air (10.04%) and Surface (10.08%). The differences are modest and should be checked for shipment mix and customer segment.
- **Customer recency:** 182 customers have had no order in the 180 days before 2025-07-31. Contact strategy should be based on recency alongside activity status and customer value; the flag alone does not confirm churn.
- **City returns:** Lake John has the highest return count among destination cities, with 3 returns from 9 shipments. The count is small, so it should not be treated as a stable city ranking.
- **Recent six-month comparison:** The latest six order months had a 10.60% return rate, versus 10.23% in the preceding six. Cancellations fell from 259 to 227, shipment volume from 5,074 to 4,926, and average transit time from 5.54 to 5.51 days. These changes do not point to broad service deterioration, though returns merit monitoring.
- **Carrier cost/service screen:** Bradley-Horton Logistics has the highest relative efficiency score (97.35/100) under the documented equal-weight score, with 96.72% reported on-time performance and 4.12 average carrier cost per km. This carrier-dimension measure is not period-matched to shipment outcomes.

## Recommended actions

1. Reconcile the meaning of delayed status against delivery promises and the elapsed-day measure. Establish a single documented operational SLA before ranking service failures.
2. Review return reasons and shipment mix for Garcia Group Warehouse and Rail deliveries. Compare like-for-like routes, weights and delivery modes before changing volume allocation.
3. Use the 182 recency-flagged customers as a review queue. Prioritize customers with higher historical shipment cost or loyalty tier and confirm whether the account remains active.
4. Monitor monthly shipment counts, cancellation counts, return rate and elapsed delivery time together. Return rates range from 8.26% to 12.97% by order month, without a consistent upward trend across the year.
5. Avoid using raw carrier on-time percentages as shipment-level outcomes without checking their definition and period. The carrier dimension's reported on-time measure is 80–99% and is not directly reconciled to the shipment status labels.

## Findings by business question

| Question | Evidence-based answer | Interpretation and caution |
| --- | --- | --- |
| Delivery time | 5.53 average days from dispatch to delivery; median 6 days. | Duration is not necessarily lateness; promised delivery dates are absent. |
| Delayed shipments | 1,042 shipments carry the `Delayed` status. 2,930 dated shipments take more than 7 days. | The measures diverge materially and need an agreed business rule. |
| Return performance | 1,041 returns, or 10.41% of all shipments. | Denominator includes cancellations because the source has no rule excluding them. |
| Cost per kilogram | 372.10 source currency units per kg (total cost divided by total weight). | The currency and pricing basis are not specified. |
| Carriers above 500 shipments | None. The highest observed carrier volume is 445. | Use the full ranking; the assignment's 500-shipment threshold yields no carriers. |
| Customer recency | 677 customers ordered in the 30 days through 2025-07-31; 182 have no order in the prior 180 days. | Fixed reference date avoids results changing with today's date. |
| Six-month return trend | Return rate rose from 10.23% in the prior six order months to 10.60% in the latest six. | Cancellations declined from 259 to 227. The 0.37 percentage-point return-rate increase is modest. |
| Carrier efficiency | Bradley-Horton Logistics ranks first at 97.35/100 with the equal-weight on-time/cost score. | Relative carrier dimension ranking; validate metric period and currency before allocation decisions. |
| Customer activity flag | 1,589 of 2,000 customers are marked active in the customer dimension. | This source flag does not mean a recent order. |
| Platinum active segment | 307 customers are both active and Platinum. | About 15.4% of the customer dimension. |
| Local delivery | No shipment destination exactly matches the registered customer city. | Could reflect synthetic city generation or differences in city meaning; confirm before interpreting geography. |

## Cross-tool validation

Excel-style aggregation tables and charts, SQLite queries and the Power BI model use the same deduplicated shipment extract and dimension keys. The CSV analysis tables are generated from that extract. SQL query 2 intentionally returns no rows for carriers above 500 shipments. The status-versus-duration reconciliation is included in both the Excel review and SQL output so that the discrepancy remains visible in the dashboard.

## Limitations

This is a synthetic learning dataset. It does not include an expected delivery date, return reason, service-level target, cost currency, route identifier or documented definition for the carrier on-time percentage. Warehouse capacity and carrier specialization do not establish operating constraints. Observed differences describe the supplied records and should be investigated before operational changes are made.

The carrier efficiency score gives equal weight to reported on-time percentage and inverse min-max normalized average carrier cost per km. It is a relative ranking, not a contractual service measure.
