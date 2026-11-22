-- Logistics and Supply Chain Delivery Performance
-- RDBMS: SQLite 3. The included logistics_analysis.db is built from data/*.csv.
-- Grain: one row per unique Shipment_ID. Dates are ISO-8601 strings.
-- Dispatch_to_Delivery_Days is elapsed time, not a contractual lateness measure.

-- 1. Highest shipment volume by customer
SELECT c.Customer_ID, c.Customer_Name, c.Loyalty_Tier, COUNT(*) AS shipment_count,
       ROUND(SUM(s.Cost_Incurred),2) AS total_cost
FROM Shipments s JOIN Customers c USING (Customer_ID)
GROUP BY c.Customer_ID, c.Customer_Name, c.Loyalty_Tier
ORDER BY shipment_count DESC, total_cost DESC LIMIT 10;

-- 2. Carriers with more than 500 shipments (an empty result is meaningful)
SELECT ca.Carrier_ID, ca.Carrier_Name, COUNT(*) AS shipment_count,
       ROUND(AVG(s.Dispatch_to_Delivery_Days),2) AS avg_dispatch_to_delivery_days,
       SUM(s.Delivery_Status='Delayed') AS delayed_shipments
FROM Shipments s JOIN Carriers ca USING (Carrier_ID)
GROUP BY ca.Carrier_ID, ca.Carrier_Name
HAVING COUNT(*) > 500
ORDER BY shipment_count DESC;

-- 3. Warehouse with the most status-labelled delayed shipments
SELECT w.Warehouse_ID, w.Warehouse_Name, w.Region,
       SUM(s.Delivery_Status='Delayed') AS delayed_shipments,
       COUNT(*) AS shipment_count,
       ROUND(1.0*SUM(s.Delivery_Status='Delayed')/COUNT(*),4) AS delayed_status_rate
FROM Shipments s JOIN Warehouses w USING (Warehouse_ID)
GROUP BY w.Warehouse_ID, w.Warehouse_Name, w.Region
ORDER BY delayed_shipments DESC LIMIT 10;

-- 4. Return rate by delivery mode
SELECT Delivery_Mode, COUNT(*) AS shipment_count, SUM(Is_Returned) AS returns,
       ROUND(1.0*SUM(Is_Returned)/COUNT(*),4) AS return_rate
FROM Shipments GROUP BY Delivery_Mode ORDER BY return_rate DESC;

-- 5. Regional costs and mean shipment weight
SELECT w.Region, COUNT(*) AS shipments,
       ROUND(SUM(s.Cost_Incurred),2) AS total_cost,
       ROUND(AVG(s.Product_Weight_kg),2) AS avg_weight_kg,
       ROUND(SUM(s.Cost_Incurred)/SUM(s.Product_Weight_kg),2) AS weighted_cost_per_kg
FROM Shipments s JOIN Warehouses w USING (Warehouse_ID)
GROUP BY w.Region ORDER BY total_cost DESC;

-- 6. Three longest dated delivery cycles among delivered shipments
SELECT Shipment_ID, Carrier_ID, Warehouse_ID, Delivery_Mode,
       Dispatch_to_Delivery_Days, Delivery_Distance_km, Product_Weight_kg, Cost_Incurred
FROM Shipments
WHERE Delivery_Status='Delivered' AND Delivery_Date IS NOT NULL
ORDER BY Dispatch_to_Delivery_Days DESC LIMIT 3;

-- 7. First service use by customer
SELECT c.Customer_ID, c.Customer_Name, MIN(s.Order_Date) AS first_order_date,
       COUNT(s.Shipment_ID) AS shipment_count
FROM Customers c LEFT JOIN Shipments s USING (Customer_ID)
GROUP BY c.Customer_ID, c.Customer_Name ORDER BY first_order_date;

-- 8. Warehouse cost ranking
SELECT w.Warehouse_ID, w.Warehouse_Name, w.Region,
       COUNT(s.Shipment_ID) AS shipments, ROUND(SUM(s.Cost_Incurred),2) AS total_cost
FROM Warehouses w LEFT JOIN Shipments s USING (Warehouse_ID)
GROUP BY w.Warehouse_ID, w.Warehouse_Name, w.Region
ORDER BY total_cost DESC;

-- 9. Shipment with highest realized cost per kilometer
SELECT Shipment_ID, Carrier_ID, Warehouse_ID, Delivery_Mode, Delivery_Status,
       Delivery_Distance_km, Cost_Incurred, ROUND(Cost_per_km,2) AS cost_per_km
FROM Shipments ORDER BY Cost_per_km DESC LIMIT 10;

-- 10. Cities with most returned shipments (shipment destination city)
SELECT Customer_City, COUNT(*) AS shipments, SUM(Is_Returned) AS returns,
       ROUND(1.0*SUM(Is_Returned)/COUNT(*),4) AS return_rate
FROM Shipments GROUP BY Customer_City ORDER BY returns DESC LIMIT 10;

-- 11. Shipment destination matches the customer's registered city
SELECT COUNT(*) AS shipments,
       SUM(Is_Local_Delivery) AS registered_city_matches,
       ROUND(1.0*SUM(Is_Local_Delivery)/COUNT(*),4) AS local_share
FROM Shipments;

-- 12. Fixed-window comparison: latest six complete order months vs preceding six.
-- With the supplied data, the reference month is 2025-07 (last order 2025-07-31).
WITH bounds AS (
  SELECT MAX(Order_Date) AS ref_date FROM Shipments
), tagged AS (
  SELECT s.*,
    CASE WHEN Order_Date >= date((SELECT ref_date FROM bounds),'start of month','-5 months') THEN 'Latest 6 months'
         WHEN Order_Date >= date((SELECT ref_date FROM bounds),'start of month','-11 months') THEN 'Prior 6 months'
         ELSE 'Outside windows' END AS period
  FROM Shipments s
)
SELECT period, COUNT(*) AS shipments, SUM(Is_Returned) AS returns,
       ROUND(1.0*SUM(Is_Returned)/COUNT(*),4) AS return_rate,
       SUM(Delivery_Status='Delayed') AS delayed_status_count,
       SUM(Delivery_Status='Cancelled') AS cancellations,
       ROUND(AVG(CASE WHEN Dispatch_to_Delivery_Days IS NOT NULL THEN Dispatch_to_Delivery_Days END),2) AS avg_transit_days
FROM tagged WHERE period <> 'Outside windows' GROUP BY period;

-- 13. Air-specialist carriers with observed return rate below 5%.
-- Mode_Speciality is not treated as exclusive capability.
SELECT ca.Carrier_ID, ca.Carrier_Name, ca.On_Time_Percentage,
       COUNT(*) AS shipments, SUM(s.Is_Returned) AS returns,
       ROUND(1.0*SUM(s.Is_Returned)/COUNT(*),4) AS return_rate
FROM Carriers ca JOIN Shipments s USING (Carrier_ID)
WHERE lower(ca.Mode_Speciality)='air' AND s.Delivery_Mode='Air'
GROUP BY ca.Carrier_ID, ca.Carrier_Name, ca.On_Time_Percentage
HAVING 1.0*SUM(s.Is_Returned)/COUNT(*) < 0.05
ORDER BY return_rate, ca.On_Time_Percentage DESC;

-- Excel / SQL validation: shipment-grain controls
SELECT COUNT(*) AS rows, COUNT(DISTINCT Shipment_ID) AS unique_shipments,
       SUM(Delivery_Date IS NULL) AS missing_delivery_dates,
       SUM(Delivery_Status='Cancelled' AND Delivery_Date IS NULL) AS cancelled_without_delivery_date,
       SUM(Delivery_Status='Cancelled' AND Delivery_Date IS NOT NULL) AS cancelled_with_delivery_date
FROM Shipments;

-- Distinguish status labels from the assignment's >7-day elapsed-time flag.
SELECT Delivery_Status,
       SUM(Dispatch_to_Delivery_Days > 7) AS elapsed_over_7_days,
       COUNT(*) AS shipments
FROM Shipments GROUP BY Delivery_Status;

-- Carrier efficiency illustration requested by the brief.
-- Score = 50% carrier on-time percentage + 50% inverse min-max normalized
-- Avg_Cost_per_km; this is a transparent, relative ranking, not a service SLA.
WITH bounds AS (
  SELECT MIN(Avg_Cost_per_km) AS min_cost, MAX(Avg_Cost_per_km) AS max_cost FROM Carriers
)
SELECT ca.Carrier_ID, ca.Carrier_Name, ca.Mode_Speciality, ca.On_Time_Percentage,
       ca.Avg_Cost_per_km,
       ROUND(0.5*ca.On_Time_Percentage + 50.0*(1-(ca.Avg_Cost_per_km-b.min_cost)/NULLIF(b.max_cost-b.min_cost,0)),2) AS efficiency_score_0_100,
       COUNT(s.Shipment_ID) AS shipment_volume,
       ROUND(1.0*SUM(s.Is_Returned)/COUNT(s.Shipment_ID),4) AS observed_return_rate
FROM Carriers ca CROSS JOIN bounds b LEFT JOIN Shipments s USING (Carrier_ID)
GROUP BY ca.Carrier_ID, ca.Carrier_Name, ca.Mode_Speciality, ca.On_Time_Percentage, ca.Avg_Cost_per_km
ORDER BY efficiency_score_0_100 DESC;

-- Customer questions: top 10 by total cost
SELECT c.Customer_ID, c.Customer_Name, c.Loyalty_Tier,
       COUNT(*) AS shipment_count, ROUND(SUM(s.Cost_Incurred),2) AS total_cost,
       SUM(s.Is_Returned) AS returns,
       ROUND(1.0*SUM(s.Is_Returned)/COUNT(*),4) AS return_rate
FROM Shipments s JOIN Customers c USING (Customer_ID)
GROUP BY c.Customer_ID, c.Customer_Name, c.Loyalty_Tier
ORDER BY total_cost DESC LIMIT 10;

-- Top customer return rates among customers with at least five shipments.
-- The minimum volume makes the ranking less sensitive to one-off records.
SELECT c.Customer_ID, c.Customer_Name, c.Loyalty_Tier,
       COUNT(*) AS shipment_count, SUM(s.Is_Returned) AS returns,
       ROUND(1.0*SUM(s.Is_Returned)/COUNT(*),4) AS return_rate,
       ROUND(SUM(s.Cost_Incurred),2) AS total_cost
FROM Shipments s JOIN Customers c USING (Customer_ID)
GROUP BY c.Customer_ID, c.Customer_Name, c.Loyalty_Tier
HAVING COUNT(*) >= 5
ORDER BY return_rate DESC, returns DESC LIMIT 10;

-- Warehouse capacity context: descriptive comparison, not a causal model.
SELECT w.Warehouse_ID, w.Warehouse_Name, w.Region, w.Capacity_Tonnes,
       COUNT(s.Shipment_ID) AS shipment_count,
       ROUND(1.0*SUM(s.Is_Returned)/COUNT(s.Shipment_ID),4) AS return_rate,
       ROUND(AVG(s.Dispatch_to_Delivery_Days),2) AS avg_dispatch_to_delivery_days
FROM Warehouses w JOIN Shipments s USING (Warehouse_ID)
GROUP BY w.Warehouse_ID, w.Warehouse_Name, w.Region, w.Capacity_Tonnes
ORDER BY w.Capacity_Tonnes DESC;
