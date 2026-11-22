"""Prepare reproducible, shared logistics analysis tables and SQL extracts."""
from __future__ import annotations
import csv, json, sqlite3
from collections import Counter, defaultdict
from datetime import date, datetime
from pathlib import Path
from statistics import mean, median
import openpyxl

ROOT = Path(__file__).resolve().parent
SOURCE = Path(r"C:\Users\omsri\Downloads\Logistics_SupplyChain_Analysis_Ready.xlsx")
DATA = ROOT / "data"
RESULTS = ROOT / "analysis"
DATA.mkdir(exist_ok=True); RESULTS.mkdir(exist_ok=True)

def read_sheet(wb, name):
    ws = wb[name]
    it = ws.iter_rows(values_only=True)
    headers = [str(x).strip() for x in next(it)]
    rows = []
    for vals in it:
        if not any(v is not None for v in vals): continue
        rows.append(dict(zip(headers, vals)))
    return headers, rows

def iso(v):
    if v is None or v == "": return None
    if isinstance(v, datetime): return v.date().isoformat()
    if isinstance(v, date): return v.isoformat()
    return str(v)[:10]

def boolval(v):
    if isinstance(v, bool): return v
    return str(v).strip().lower() in {"true", "1", "yes", "y"}

def write_csv(path, rows, fields=None):
    if fields is None: fields = list(rows[0]) if rows else []
    with path.open("w", newline="", encoding="utf-8-sig") as f:
        w = csv.DictWriter(f, fieldnames=fields, extrasaction="ignore")
        w.writeheader()
        for row in rows:
            w.writerow({k: ("" if row.get(k) is None else row.get(k)) for k in fields})

wb = openpyxl.load_workbook(SOURCE, read_only=True, data_only=True)
_, customers = read_sheet(wb, "Customers")
_, warehouses = read_sheet(wb, "Warehouse")
_, carriers = read_sheet(wb, "Carriers")
_, raw_shipments = read_sheet(wb, "Shipments")

# Keep only fields needed for analysis/modeling; contact details are intentionally excluded.
customers = [{**r, "Sign_Up_Date": iso(r.get("Sign_Up_Date")), "Is_Active": boolval(r.get("Is_Active"))}
             for r in customers]
customer_fields = ["Customer_ID", "Customer_Name", "Gender", "Age", "Sign_Up_Date", "Loyalty_Tier", "City", "State", "Is_Active"]
warehouses = [{**r, "Is_Active": boolval(r.get("Is_Active"))} for r in warehouses]
warehouse_fields = ["Warehouse_ID", "Warehouse_Name", "Region", "City", "State", "Capacity_Tonnes", "Is_Active"]
carriers = [{**r, "On_Time_Percentage": float(r["On_Time_Percentage"]) if r.get("On_Time_Percentage") not in (None, "") else None,
             "Avg_Cost_per_km": float(r["Avg_Cost_per_km"]) if r.get("Avg_Cost_per_km") not in (None, "") else None} for r in carriers]
carrier_fields = ["Carrier_ID", "Carrier_Name", "Mode_Speciality", "Avg_Cost_per_km", "On_Time_Percentage"]

# De-duplicate by Shipment_ID, preserving the first source row; report any duplicates.
seen = set(); duplicate_ids = []
shipments = []
for r in raw_shipments:
    sid = str(r["Shipment_ID"]).strip()
    if sid in seen:
        duplicate_ids.append(sid); continue
    seen.add(sid)
    q = dict(r)
    for d in ("Order_Date", "Dispatch_Date", "Delivery_Date"): q[d] = iso(q.get(d))
    q["Shipment_ID"] = sid
    q["Is_Returned"] = boolval(q.get("Is_Returned"))
    q["Delivery_Distance_km"] = float(q["Delivery_Distance_km"])
    q["Product_Weight_kg"] = float(q["Product_Weight_kg"])
    q["Cost_Incurred"] = float(q["Cost_Incurred"])
    od = date.fromisoformat(q["Order_Date"]); dd = date.fromisoformat(q["Dispatch_Date"])
    delivered = date.fromisoformat(q["Delivery_Date"]) if q["Delivery_Date"] else None
    q["Dispatch_to_Delivery_Days"] = (delivered-dd).days if delivered else None
    q["Order_to_Dispatch_Days"] = (dd-od).days
    q["Cost_per_kg"] = q["Cost_Incurred"]/q["Product_Weight_kg"] if q["Product_Weight_kg"] else None
    q["Cost_per_km"] = q["Cost_Incurred"]/q["Delivery_Distance_km"] if q["Delivery_Distance_km"] else None
    q["Delivery_Month"] = od.strftime("%Y-%m")
    shipments.append(q)

cmap = {r["Customer_ID"]: r for r in customers}
wmap = {r["Warehouse_ID"]: r for r in warehouses}
rmap = {r["Carrier_ID"]: r for r in carriers}
for s in shipments:
    c, wh, ca = cmap.get(s["Customer_ID"], {}), wmap.get(s["Warehouse_ID"], {}), rmap.get(s["Carrier_ID"], {})
    s["Loyalty_Tier"] = c.get("Loyalty_Tier")
    s["Customer_Registered_City"] = c.get("City")
    s["Warehouse_Region"] = wh.get("Region")
    s["Warehouse_Name"] = wh.get("Warehouse_Name")
    s["Carrier_Name"] = ca.get("Carrier_Name")
    s["Carrier_On_Time_Percentage"] = ca.get("On_Time_Percentage")
    s["Is_Local_Delivery"] = (s.get("Customer_City") or "").strip().casefold() == (c.get("City") or "").strip().casefold()

shipment_fields = ["Shipment_ID", "Customer_ID", "Order_Date", "Dispatch_Date", "Delivery_Date", "Delivery_Status", "Warehouse_ID", "Carrier_ID", "Delivery_Distance_km", "Product_Weight_kg", "Delivery_Mode", "Cost_Incurred", "Customer_City", "Is_Returned", "Dispatch_to_Delivery_Days", "Order_to_Dispatch_Days", "Cost_per_kg", "Cost_per_km", "Delivery_Month", "Loyalty_Tier", "Customer_Registered_City", "Warehouse_Region", "Warehouse_Name", "Carrier_Name", "Carrier_On_Time_Percentage", "Is_Local_Delivery"]
write_csv(DATA/"Customers.csv", customers, customer_fields)
write_csv(DATA/"Warehouses.csv", warehouses, warehouse_fields)
write_csv(DATA/"Carriers.csv", carriers, carrier_fields)
write_csv(DATA/"Shipments.csv", shipments, shipment_fields)
# JSON sidecars are temporary inputs for the workbook builder; CSV remains the shared source.
for _name, _rows in [("Customers", customers), ("Warehouses", warehouses), ("Carriers", carriers), ("Shipments", shipments)]:
    (DATA/f".{_name}.json").write_text(json.dumps(_rows, default=str), encoding="utf-8")

def group_rows(key_fn):
    g=defaultdict(list)
    for s in shipments: g[key_fn(s)].append(s)
    return g
def summary(rows, key, name):
    total=len(rows); returns=sum(bool(x["Is_Returned"]) for x in rows)
    delivered=[x for x in rows if x["Dispatch_to_Delivery_Days"] is not None]
    return {name:key, "Shipments":total, "Delivered_or_Dated":len(delivered), "Total_Cost":sum(x["Cost_Incurred"] for x in rows),
      "Avg_Cost_per_Shipment":mean(x["Cost_Incurred"] for x in rows) if rows else None,
      "Avg_Weight_kg":mean(x["Product_Weight_kg"] for x in rows) if rows else None,
      "Avg_Delivery_Days":mean(x["Dispatch_to_Delivery_Days"] for x in delivered) if delivered else None,
      "Delayed_Shipments":sum(x["Delivery_Status"]=="Delayed" for x in rows),
      "Cancelled_Shipments":sum(x["Delivery_Status"]=="Cancelled" for x in rows),
      "Returns":returns, "Return_Rate":returns/total if total else None}

def export_group(file, grouper, name, sortkey="Shipments", reverse=True):
    rows=[summary(v,k,name) for k,v in grouper.items()]
    rows.sort(key=lambda r:(r.get(sortkey) is None, -(r.get(sortkey) or 0)) if reverse else (r.get(sortkey) is None, r.get(sortkey) or 0))
    write_csv(RESULTS/file,rows)
    (RESULTS/(Path(file).stem+".json")).write_text(json.dumps(rows,default=str),encoding="utf-8")
    return rows

by_customer=group_rows(lambda s:s["Customer_ID"])
by_carrier=group_rows(lambda s:s["Carrier_Name"] or "Unmatched")
by_warehouse=group_rows(lambda s:s["Warehouse_Name"] or "Unmatched")
by_region=group_rows(lambda s:s["Warehouse_Region"] or "Unmatched")
by_mode=group_rows(lambda s:s["Delivery_Mode"])
by_tier=group_rows(lambda s:s["Loyalty_Tier"] or "Unmatched")
by_month=group_rows(lambda s:s["Delivery_Month"])
by_city=group_rows(lambda s:s["Customer_City"] or "Unknown")
customer_stats=export_group("Customer_Performance.csv",by_customer,"Customer_ID")
carrier_stats=export_group("Carrier_Performance.csv",by_carrier,"Carrier")
warehouse_stats=export_group("Warehouse_Performance.csv",by_warehouse,"Warehouse")
region_stats=export_group("Regional_Performance.csv",by_region,"Region")
mode_stats=export_group("Delivery_Mode_Performance.csv",by_mode,"Delivery_Mode")
tier_stats=export_group("Loyalty_Performance.csv",by_tier,"Loyalty_Tier")
monthly_stats=export_group("Monthly_Performance.csv",by_month,"Month",sortkey="Month",reverse=False)
city_stats=export_group("City_Performance.csv",by_city,"Customer_City")

# Enrich customer rollup with identity, activity, return rate, and fixed-reference recency.
max_order=max(date.fromisoformat(s["Order_Date"]) for s in shipments)
customer_output=[]; activity30=0; churn=[]
for c in customers:
    rows=by_customer.get(c["Customer_ID"],[])
    dates=[date.fromisoformat(s["Order_Date"]) for s in rows]
    last=max(dates) if dates else None
    returns=sum(s["Is_Returned"] for s in rows)
    gap=(max_order-last).days if last else None
    if last and gap<=30: activity30+=1
    if last is None or gap>180: churn.append(c["Customer_ID"])
    customer_output.append({"Customer_ID":c["Customer_ID"],"Customer_Name":c["Customer_Name"],"Loyalty_Tier":c["Loyalty_Tier"],"Is_Active":c["Is_Active"],"Signup_Date":c["Sign_Up_Date"],"Shipments":len(rows),"Total_Cost":sum(s["Cost_Incurred"] for s in rows),"Returns":returns,"Return_Rate":returns/len(rows) if rows else 0,"First_Order_Date":min(dates).isoformat() if dates else None,"Last_Order_Date":last.isoformat() if last else None,"Days_Since_Last_Order":gap,"Churn_Risk_180d":gap is None or gap>180})
customer_output.sort(key=lambda r:(-r["Shipments"],r["Customer_ID"]))
write_csv(RESULTS/"Customer_Segmentation.csv",customer_output)
(RESULTS/"Customer_Segmentation.json").write_text(json.dumps(customer_output,default=str),encoding="utf-8")
write_csv(RESULTS/"Potential_Churn_Customers.csv",[x for x in customer_output if x["Churn_Risk_180d"]])
for _filename, _key in [("Top_Customers_by_Shipments.csv","Shipments"),("Top_Customers_by_Cost.csv","Total_Cost")]:
    _ranked=sorted(customer_output,key=lambda x:(-(x[_key] or 0),x["Customer_ID"]))[:10]
    write_csv(RESULTS/_filename,_ranked)
    (RESULTS/(Path(_filename).stem+".json")).write_text(json.dumps(_ranked,default=str),encoding="utf-8")
_ranked_returns=sorted([x for x in customer_output if x["Shipments"]>=5],key=lambda x:(-x["Return_Rate"],-x["Returns"],x["Customer_ID"]))[:10]
write_csv(RESULTS/"Top_Customers_by_Return_Rate_Min5Shipments.csv",_ranked_returns)
(RESULTS/"Top_Customers_by_Return_Rate_Min5Shipments.json").write_text(json.dumps(_ranked_returns,default=str),encoding="utf-8")

# Long delivery and unit-cost exceptions are inspectable detail, not claims of fraud.
dated=[s for s in shipments if s["Dispatch_to_Delivery_Days"] is not None]
long_delays=sorted([s for s in dated if s["Dispatch_to_Delivery_Days"]>7],key=lambda x:-x["Dispatch_to_Delivery_Days"])
write_csv(RESULTS/"Long_Delivery_Over_7_Days.csv",long_delays,shipment_fields)
high_cost_kg=sorted([s for s in shipments if s["Cost_per_kg"] is not None],key=lambda x:-x["Cost_per_kg"])
write_csv(RESULTS/"Highest_Cost_per_kg.csv",high_cost_kg[:100],shipment_fields)
frequent=sorted([x for x in customer_output if x["Returns"]>=2],key=lambda x:(-x["Returns"],-x["Return_Rate"]))
write_csv(RESULTS/"Frequent_Return_Customers.csv",frequent)
top_cancel=sorted(region_stats,key=lambda x:-(x["Cancelled_Shipments"]/x["Shipments"] if x["Shipments"] else 0))
top_return_warehouses=sorted(warehouse_stats,key=lambda x:-(x["Return_Rate"] or 0))

# Monthly trends use order month; dated duration calculations exclude undelivered/cancelled shipments.
monthly=[]
months=sorted(by_month)
for m in months:
    rows=by_month[m]
    ds=[s["Dispatch_to_Delivery_Days"] for s in rows if s["Dispatch_to_Delivery_Days"] is not None]
    monthly.append({"Month":m,"Shipments":len(rows),"Delivered":sum(s["Delivery_Status"]=="Delivered" for s in rows),"Delayed":sum(s["Delivery_Status"]=="Delayed" for s in rows),"Cancelled":sum(s["Delivery_Status"]=="Cancelled" for s in rows),"Returns":sum(s["Is_Returned"] for s in rows),"Return_Rate":sum(s["Is_Returned"] for s in rows)/len(rows),"Avg_Delivery_Days":mean(ds) if ds else None})
write_csv(RESULTS/"Monthly_Performance.csv",monthly)
(RESULTS/"Monthly_Performance.json").write_text(json.dumps(monthly,default=str),encoding="utf-8")

# SQLite RDBMS: reproducible SQL analysis source.
db=sqlite3.connect(ROOT/"logistics_analysis.db")
db.execute("PRAGMA foreign_keys=ON")
for _tbl in ("Shipments","Customers","Warehouses","Carriers"):
    db.execute(f'DROP TABLE IF EXISTS "{_tbl}"')
for tbl, rows, fields in [("Customers",customers,customer_fields),("Warehouses",warehouses,warehouse_fields),("Carriers",carriers,carrier_fields),("Shipments",shipments,shipment_fields)]:
    types=[]
    for f in fields:
        typ="REAL" if f in {"Age","Capacity_Tonnes","Avg_Cost_per_km","On_Time_Percentage","Delivery_Distance_km","Product_Weight_kg","Cost_Incurred","Dispatch_to_Delivery_Days","Order_to_Dispatch_Days","Cost_per_kg","Cost_per_km","Carrier_On_Time_Percentage"} else "INTEGER" if f in {"Is_Active","Is_Returned","Is_Local_Delivery"} else "TEXT"
        types.append(f'"{f}" {typ}')
    pk={"Customers":"Customer_ID","Warehouses":"Warehouse_ID","Carriers":"Carrier_ID","Shipments":"Shipment_ID"}[tbl]
    constraints=[f'PRIMARY KEY ("{pk}")']
    if tbl=="Shipments":
        constraints += ['FOREIGN KEY ("Customer_ID") REFERENCES Customers(Customer_ID)', 'FOREIGN KEY ("Warehouse_ID") REFERENCES Warehouses(Warehouse_ID)', 'FOREIGN KEY ("Carrier_ID") REFERENCES Carriers(Carrier_ID)']
    db.execute(f'CREATE TABLE "{tbl}" ({", ".join(types+constraints)})')
    marks=",".join("?" for _ in fields)
    db.executemany(f'INSERT INTO "{tbl}" ({",".join(chr(34)+f+chr(34) for f in fields)}) VALUES ({marks})',[[r.get(f) for f in fields] for r in rows])
db.commit(); db.close()

def safe_mean(vals): return mean(vals) if vals else None
delays=[s["Dispatch_to_Delivery_Days"] for s in dated]
status=Counter(s["Delivery_Status"] for s in shipments)
returns=sum(s["Is_Returned"] for s in shipments)
loyalty_metrics={r["Loyalty_Tier"]:r for r in tier_stats}
summary_data={"source_file":SOURCE.name,"as_of_date":max_order.isoformat(),"shipment_count":len(shipments),"customer_count":len(customers),"warehouse_count":len(warehouses),"carrier_count":len(carriers),"duplicate_shipment_rows_removed":len(duplicate_ids),"duplicate_shipment_ids":sorted(set(duplicate_ids)),"missing_delivery_dates":sum(s["Delivery_Date"] is None for s in shipments),"unmatched_customer_ids":sum(s["Customer_ID"] not in cmap for s in shipments),"unmatched_warehouse_ids":sum(s["Warehouse_ID"] not in wmap for s in shipments),"unmatched_carrier_ids":sum(s["Carrier_ID"] not in rmap for s in shipments),"status_counts":dict(status),"total_cost":sum(s["Cost_Incurred"] for s in shipments),"avg_cost_per_shipment":mean(s["Cost_Incurred"] for s in shipments),"avg_cost_per_kg":sum(s["Cost_Incurred"] for s in shipments)/sum(s["Product_Weight_kg"] for s in shipments),"overall_return_rate":returns/len(shipments),"avg_delivery_days":safe_mean(delays),"delivery_duration_median":median(delays),"delayed_over_7_days":sum((s["Dispatch_to_Delivery_Days"] or 0)>7 for s in shipments),"customers_with_order_last_30_days":activity30,"customers_churn_risk_180d":len(churn),"active_customers":sum(c["Is_Active"] for c in customers),"platinum_active_customers":sum(c["Is_Active"] and c["Loyalty_Tier"]=="Platinum" for c in customers),"local_delivery_share":sum(s["Is_Local_Delivery"] for s in shipments)/len(shipments),"top_customer_by_volume":customer_output[0],"top_carriers":carrier_stats[:5],"top_regions_by_delays":sorted(region_stats,key=lambda x:-x["Delayed_Shipments"])[:5],"highest_return_warehouse":top_return_warehouses[0] if top_return_warehouses else None,"top_mode_by_return_rate":max(mode_stats,key=lambda x:x["Return_Rate"]),"top_city_by_returns":max(city_stats,key=lambda x:x["Returns"]),"top_cost_per_km_shipment":max(shipments,key=lambda x:x["Cost_per_km"]),"top_cost_per_kg_shipment":high_cost_kg[0],"monthly":monthly,"customer_tier":tier_stats,"regions":region_stats,"carriers":carrier_stats,"warehouses":warehouse_stats,"modes":mode_stats,"loyalty":tier_stats}
(RESULTS/"summary.json").write_text(json.dumps(summary_data,indent=2,default=str),encoding="utf-8")
print(json.dumps({k:summary_data[k] for k in ["shipment_count","customer_count","warehouse_count","carrier_count","duplicate_shipment_rows_removed","missing_delivery_dates","status_counts","total_cost","avg_cost_per_kg","overall_return_rate","avg_delivery_days","customers_with_order_last_30_days","customers_churn_risk_180d","top_customer_by_volume","top_mode_by_return_rate","top_city_by_returns"]},indent=2,default=str))
