# Power BI Model and Dashboard

## Load the shared data

In Power BI Desktop, use **Get Data → Text/CSV** and import `Customers.csv`, `Warehouses.csv`, `Carriers.csv` and `Shipments.csv` from `data/`. The project CSVs are the cleaned analysis source used by the included SQLite database. The `Shipments` extract is one row per shipment and contains derived elapsed-time and unit-cost fields for auditability.

Set `Order_Date`, `Dispatch_Date`, `Delivery_Date`, `Sign_Up_Date` to Date; measures and costs to Decimal Number; `Is_Active`, `Is_Returned`, and `Is_Local_Delivery` to True/False; and IDs to Text. Keep missing delivery dates null. Do not replace them with order, dispatch or refresh dates.

## Star schema

Create active, single-direction, one-to-many relationships:

| One side | Many side | Key |
| --- | --- | --- |
| Customers | Shipments | Customer_ID |
| Warehouses | Shipments | Warehouse_ID |
| Carriers | Shipments | Carrier_ID |

`Shipments` is the fact table because each row records one operational event with additive cost, weight, distance, return and status fields. Customers, Warehouses and Carriers describe entities and provide filtering attributes; they are dimensions. Keep the relationships on IDs. Do not create additional relationships from the joined name/region fields in Shipments.

Create a dedicated calendar table and mark it as the date table. Relate it to `Shipments[Order_Date]` for the default shipment trend. Use inactive relationships or explicit measures for dispatch and delivery date analyses to avoid ambiguous filter paths.

```DAX
Calendar =
ADDCOLUMNS(
    CALENDAR(MIN(Shipments[Order_Date]), MAX(Shipments[Order_Date])),
    "Year", YEAR([Date]),
    "Month", FORMAT([Date], "MMM yyyy"),
    "Month Sort", YEAR([Date]) * 100 + MONTH([Date])
)

Shipment Count = DISTINCTCOUNT(Shipments[Shipment_ID])
Total Cost = SUM(Shipments[Cost_Incurred])
Average Cost per Shipment = DIVIDE([Total Cost], [Shipment Count])
Return Count = CALCULATE([Shipment Count], Shipments[Is_Returned] = TRUE())
Return Rate = DIVIDE([Return Count], [Shipment Count])
Delayed Status Count = CALCULATE([Shipment Count], Shipments[Delivery_Status] = "Delayed")
Cancelled Count = CALCULATE([Shipment Count], Shipments[Delivery_Status] = "Cancelled")
Average Dispatch to Delivery Days = AVERAGE(Shipments[Dispatch_to_Delivery_Days])
Shipments Over 7 Days =
    CALCULATE([Shipment Count], Shipments[Dispatch_to_Delivery_Days] > 7)
Average Cost per kg = DIVIDE([Total Cost], SUM(Shipments[Product_Weight_kg]))
Average Cost per km = DIVIDE([Total Cost], SUM(Shipments[Delivery_Distance_km]))
Active Customer Count = CALCULATE(DISTINCTCOUNT(Customers[Customer_ID]), Customers[Is_Active] = TRUE())
Active Platinum Customers =
    CALCULATE([Active Customer Count], Customers[Loyalty_Tier] = "Platinum")
Carrier Efficiency Score =
VAR CarrierOnTime = DIVIDE(SELECTEDVALUE(Carriers[On_Time_Percentage]), 100)
VAR MinCarrierCost = MINX(ALL(Carriers), Carriers[Avg_Cost_per_km])
VAR MaxCarrierCost = MAXX(ALL(Carriers), Carriers[Avg_Cost_per_km])
VAR CostScore = 1 - DIVIDE(SELECTEDVALUE(Carriers[Avg_Cost_per_km]) - MinCarrierCost,
                            MaxCarrierCost - MinCarrierCost)
RETURN 50 * CarrierOnTime + 50 * CostScore
```

The score ranges from 0 to 100 and gives equal weight to the carrier dimension's reported on-time percentage and inverse min-max normalized cost per km. It is a relative screening metric. The source does not document the carrier metric period or currency.

For recency, use the fixed project date `2025-07-31` when reproducing the submitted figures. A refresh-relative measure will change with new data and should be clearly labelled as a live view. The CSV `analysis/Customer_Segmentation.csv` includes the fixed-date `Days_Since_Last_Order` and `Churn_Risk_180d` fields.

## Dashboard pages

### 1. Executive overview

- Cards: shipment count, total cost, average dispatch-to-delivery days, return rate, delayed-status count, cancellation count.
- Monthly line chart: shipment volume and delayed/cancelled counts by order month.
- Bar chart: return rate by delivery mode and loyalty tier.
- Table: five highest-volume carriers with volume, average transit days, cost and dimension on-time percentage.
- Note: elapsed days over seven and `Delayed` status are separate measures in this dataset.

### 2. Operations

- Return rate and shipment count by warehouse and region.
- Delay status count by city and carrier.
- Delivery mode by status matrix.
- Scatter: average carrier on-time percentage versus average realized cost per shipment, bubble size = shipment volume.
- Detail table: shipment ID, dispatch date, delivery date, elapsed days, status and return flag. Highlight elapsed time over seven days and returned shipments.

### 3. Customer and retention

- Slicers: Loyalty_Tier, Is_Active, Warehouse Region, Delivery Mode and date.
- Shipment count, total cost and return rate by loyalty tier.
- Top customers by volume and cost; separate table for customers with at least two returns.
- Fixed-date recency queue using `analysis/Customer_Segmentation.csv`, with last order date, days since last order, tier and shipment cost.

### 4. Data quality

- Shipment IDs versus distinct shipment IDs.
- Missing delivery date by status.
- Status versus elapsed-time-over-seven reconciliation.
- Dimension key match counts and date range.

## Interpretation notes

- Use the `Delivery_Status` field for status-labelled delay/cancellation counts. Use `Dispatch_to_Delivery_Days` for elapsed duration. Do not relabel elapsed duration as late delivery because no promised delivery date is supplied.
- The carrier dimension's `On_Time_Percentage` is a carrier attribute. Its calculation period and denominator are not given, so show it as a reported carrier metric, not as a shipment-level actual.
- `Mode_Speciality` is not an exclusivity rule. For an air-carrier comparison, filter observed Air shipments and show the specialization as context.
- Return rates include all shipments in the denominator. If the business wants a delivered-only denominator, agree on that rule and publish the changed definition.
- The source currency is unspecified. Display costs as source currency units until confirmed.
