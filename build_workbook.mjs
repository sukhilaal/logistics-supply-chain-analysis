import fs from "node:fs/promises";
import path from "node:path";
import { SpreadsheetFile, Workbook } from "@oai/artifact-tool";

const root = path.dirname(new URL(import.meta.url).pathname.replace(/^\//, "").replaceAll("%20", " "));
const outDir = path.join(root, "outputs", "01a201f0-580a-7f20-b78c-69665c732e97");
await fs.mkdir(outDir, { recursive: true });
const readJson = async (p) => JSON.parse(await fs.readFile(path.join(root, p), "utf8"));
const [summary, customers, warehouses, carriers, shipments, custSeg, carrierStats, whStats, regionStats, modeStats, tierStats, monthly, topByVolume, topByCost, topByReturn] = await Promise.all([
  readJson("analysis/summary.json"), readJson("data/.Customers.json"), readJson("data/.Warehouses.json"),
  readJson("data/.Carriers.json"), readJson("data/.Shipments.json"),
  readJson("analysis/Customer_Segmentation.json"), readJson("analysis/Carrier_Performance.json"),
  readJson("analysis/Warehouse_Performance.json"), readJson("analysis/Regional_Performance.json"),
  readJson("analysis/Delivery_Mode_Performance.json"), readJson("analysis/Loyalty_Performance.json"), readJson("analysis/Monthly_Performance.json"),
  readJson("analysis/Top_Customers_by_Shipments.json"), readJson("analysis/Top_Customers_by_Cost.json"), readJson("analysis/Top_Customers_by_Return_Rate_Min5Shipments.json")
]);

const wb = Workbook.create();
const font = "Arial";
const navy = "#17324D", blue = "#2F6690", pale = "#EAF1F7", ink = "#23313F", muted = "#5B6770", amber = "#FFF0CC", red = "#FCE8E6", green = "#E6F4EA";
const dateCols = new Set(["Order_Date", "Dispatch_Date", "Delivery_Date", "Sign_Up_Date", "Signup_Date", "First_Order_Date", "Last_Order_Date"]);
const toDate = (x) => typeof x === "string" && /^\d{4}-\d{2}-\d{2}$/.test(x) ? new Date(`${x}T00:00:00Z`) : x;
const cleanRow = (row) => Object.fromEntries(Object.entries(row).map(([k,v]) => [k, dateCols.has(k) ? toDate(v) : v]));
const col = (n) => { let s=""; while(n>0){const r=(n-1)%26;s=String.fromCharCode(65+r)+s;n=Math.floor((n-1)/26);} return s; };
function title(sheet, text, note="") {
  sheet.getRange("A1").values=[[text]];
  sheet.getRange("A1").format={font:{name:font,size:16,bold:true,color:navy}};
  if(note){sheet.getRange("A2").values=[[note]];sheet.getRange("A2").format={font:{name:font,size:10,italic:true,color:muted}};}
}
function header(sheet, address) { sheet.getRange(address).format={fill:navy,font:{name:font,size:10,bold:true,color:"#FFFFFF"},horizontalAlignment:"center",verticalAlignment:"center",wrapText:true}; }
function table(sheet, address, name){const t=sheet.tables.add(address,true,name);t.showFilterButton=true;return t;}
function sheetData(name, label, rows, headers, tab) {
  const s=wb.worksheets.add(name); title(s,label);
  const data=[headers,...rows.map(r=>headers.map(h=>r[h] ?? null))];
  const end=col(headers.length), last=data.length;
  s.getRange(`A4:${end}${last+3}`).values=data;
  header(s,`A4:${end}4`);
  s.getRange(`A5:${end}${last+3}`).format={font:{name:font,size:9,color:ink},verticalAlignment:"center"};
  if(rows.length) table(s,`A4:${end}${last+3}`,tab);
  s.getRange(`A4:${end}${Math.min(last+3,500)}`).format.autofitColumns();
  s.getRange(`A4:${end}4`).format.rowHeight=32;
  s.freezePanes.freezeRows(4);
  return s;
}

// Summary and visuals
const dash=wb.worksheets.add("Overview");
title(dash,"Logistics & Supply Chain | Delivery Performance",`10,000 shipment records • Order dates ${summary.monthly[0].Month} to ${summary.monthly.at(-1).Month} • fixed recency date ${summary.as_of_date}`);
const kpis=[
  ["Shipments",summary.shipment_count,"#,##0"], ["Total cost (source units)",summary.total_cost,"#,##0"],
  ["Average transit days",summary.avg_delivery_days,"0.00"], ["Return rate",summary.overall_return_rate,"0.0%"],
  ["Delayed status",summary.status_counts.Delayed,"#,##0"], ["Cancelled",summary.status_counts.Cancelled,"#,##0"]
];
for(let i=0;i<kpis.length;i++){
  const start=1+i*3, c1=col(start), c2=col(start+1);
  dash.getRange(`${c1}4:${c2}4`).merge(); dash.getRange(`${c1}4`).values=[[kpis[i][0]]];
  dash.getRange(`${c1}4:${c2}4`).format={fill:pale,font:{name:font,size:10,bold:true,color:muted},horizontalAlignment:"center",verticalAlignment:"center"};
  dash.getRange(`${c1}5:${c2}5`).merge(); dash.getRange(`${c1}5`).values=[[kpis[i][1]]];
  dash.getRange(`${c1}5:${c2}5`).format={font:{name:font,size:16,bold:true,color:navy},horizontalAlignment:"center",verticalAlignment:"center",numberFormat:kpis[i][2]};
}
dash.getRange("A7").values=[["What stands out"]];dash.getRange("A7").format={font:{name:font,size:12,bold:true,color:navy}};
const notes=[
  [`Warehouse`,`${summary.highest_return_warehouse.Warehouse} records ${summary.highest_return_warehouse.Returns} returns from ${summary.highest_return_warehouse.Shipments} shipments (${(summary.highest_return_warehouse.Return_Rate*100).toFixed(1)}%). Review shipment mix and reasons before assigning cause.`],
  [`Mode`,`${summary.top_mode_by_return_rate.Delivery_Mode} has the highest mode return rate at ${(summary.top_mode_by_return_rate.Return_Rate*100).toFixed(1)}%; Air and Surface are close to 10%.`],
  [`Recency`,`${summary.customers_churn_risk_180d} customers have no order in the 180 days before ${summary.as_of_date}. This is a review flag, not confirmed churn.`],
  [`Definition`,`${summary.delayed_over_7_days.toLocaleString()} dated shipments exceed 7 dispatch-to-delivery days; only ${summary.status_counts.Delayed.toLocaleString()} are status-labelled Delayed. Keep duration and status measures separate.`]
];
dash.getRange("A8:A11").values=notes.map(x=>[x[0]]);dash.getRange("A8:A11").format.columnWidth=28;dash.getRange("A8:A11").format={font:{name:font,size:10,bold:true,color:blue},verticalAlignment:"center"};
for(let row=8;row<=11;row++){dash.mergeCells(`B${row}:Q${row}`);dash.getRange(`B${row}`).values=[[`\u00a0\u00a0${notes[row-8][1]}`]];dash.getRange(`B${row}:Q${row}`).format={font:{name:font,size:10,color:ink},wrapText:true,verticalAlignment:"center"};}
dash.getRange("A8:Q11").format.rowHeight=30;

dash.getRange("A14:G14").values=[["Month","Shipments","Delayed status","Cancelled","Returns","Return rate","Avg transit days"]];
const monthlyRows=summary.monthly.map(m=>[m.Month,m.Shipments,m.Delayed,m.Cancelled,m.Returns,m.Return_Rate,m.Avg_Delivery_Days]);
dash.getRange(`A15:G${14+monthlyRows.length}`).values=monthlyRows;header(dash,"A14:G14");table(dash,`A14:G${14+monthlyRows.length}`,"MonthlySummary");
dash.getRange(`F15:F${14+monthlyRows.length}`).format.numberFormat="0.0%";dash.getRange(`G15:G${14+monthlyRows.length}`).format.numberFormat="0.00";
dash.getRange("A14:A26").format.columnWidth=13;dash.getRange("B14:E26").format.columnWidth=16;dash.getRange("F14:G26").format.columnWidth=16;
dash.getRange("J14:N14").values=[["Top carriers by volume","Shipments","Avg transit days","Return rate","On-time %"]];
const carrierDim=Object.fromEntries(carriers.map(c=>[c.Carrier_ID,c]));
const topCarrierRows=carrierStats.slice(0,5).map(x=>{const ca=carriers.find(c=>c.Carrier_Name===x.Carrier)||{};return[x.Carrier,x.Shipments,x.Avg_Delivery_Days,x.Return_Rate,ca.On_Time_Percentage==null?null:ca.On_Time_Percentage/100]});
dash.getRange("J15:N19").values=topCarrierRows;header(dash,"J14:N14");table(dash,"J14:N19","TopCarriers");dash.getRange("L15:L19").format.numberFormat="0.00";dash.getRange("M15:M19").format.numberFormat="0.0%";dash.getRange("N15:N19").format.numberFormat="0.0%";dash.getRange("J14:J19").format.columnWidth=34;dash.getRange("K14:K19").format.columnWidth=12;dash.getRange("L14:N19").format.columnWidth=15;
const tr=dash.charts.add("line",dash.getRange(`A14:D${14+monthlyRows.length}`));tr.title="Monthly shipment status";tr.titleTextStyle.typeface=font;tr.titleTextStyle.fontSize=12;tr.legend={position:"top",textStyle:{typeface:font,fontSize:10}};tr.xAxis={axisType:"textAxis",textStyle:{typeface:font,fontSize:9}};tr.yAxis={numberFormatCode:"#,##0",numberFormatSourceLinked:false,textStyle:{typeface:font,fontSize:9}};tr.setPosition("A30","H47");
const cr=dash.charts.add("line",dash.getRange("J14:K19"));cr.title="Carrier shipment volume";cr.titleTextStyle.typeface=font;cr.titleTextStyle.fontSize=12;cr.legend={position:"top",textStyle:{typeface:font,fontSize:9}};cr.xAxis={axisType:"textAxis",textStyle:{typeface:font,fontSize:9}};cr.yAxis={numberFormatCode:"#,##0",numberFormatSourceLinked:false,textStyle:{typeface:font,fontSize:9}};cr.setPosition("J30","Q47");
dash.getRange("A41:D41").values=[["Loyalty tier","Shipments","Returns","Return rate"]];
dash.getRange("A42:D44").values=tierStats.map(x=>[x.Loyalty_Tier,x.Shipments,x.Returns,x.Return_Rate]);header(dash,"A41:D41");table(dash,"A41:D44","TierSummary");dash.getRange("D42:D44").format.numberFormat="0.0%";
const tierChart=dash.charts.add("line",[dash.getRange("A41:A44"),dash.getRange("D41:D44")]);tierChart.title="Return rate by loyalty tier";tierChart.titleTextStyle.typeface=font;tierChart.titleTextStyle.fontSize=12;tierChart.hasLegend=false;tierChart.xAxis={axisType:"textAxis",textStyle:{typeface:font,fontSize:9}};tierChart.yAxis={numberFormatCode:"0.0%",numberFormatSourceLinked:false,textStyle:{typeface:font,fontSize:9}};tierChart.setPosition("A47","H64");

// Supporting analyses
const delivery=wb.worksheets.add("Delivery Analysis");title(delivery,"Delivery and return analysis","Status-labelled outcomes and elapsed duration are reported separately.");
delivery.getRange("A4:H4").values=[["Region","Shipments","Delayed status","Cancelled","Returns","Return rate","Avg transit days","Total cost"]];
delivery.getRange(`A5:H${4+regionStats.length}`).values=regionStats.map(x=>[x.Region,x.Shipments,x.Delayed_Shipments,x.Cancelled_Shipments,x.Returns,x.Return_Rate,x.Avg_Delivery_Days,x.Total_Cost]);header(delivery,`A4:H4`);table(delivery,`A4:H${4+regionStats.length}`,"RegionPerformance");delivery.getRange(`F5:F${4+regionStats.length}`).format.numberFormat="0.0%";delivery.getRange(`G5:G${4+regionStats.length}`).format.numberFormat="0.00";delivery.getRange(`H5:H${4+regionStats.length}`).format.numberFormat="#,##0";
delivery.getRange("J4:N4").values=[["Mode","Shipments","Returns","Return rate","Avg transit days"]];delivery.getRange("J5:N7").values=modeStats.map(x=>[x.Delivery_Mode,x.Shipments,x.Returns,x.Return_Rate,x.Avg_Delivery_Days]);header(delivery,"J4:N4");table(delivery,"J4:N7","ModePerformance");delivery.getRange("M5:M7").format.numberFormat="0.0%";delivery.getRange("N5:N7").format.numberFormat="0.00";
delivery.getRange("A12:H12").values=[["Month","Shipments","Delivered","Delayed","Cancelled","Returns","Return rate","Avg transit days"]];delivery.getRange(`A13:H${12+monthly.length}`).values=monthly.map(m=>[m.Month,m.Shipments,m.Delivered,m.Delayed,m.Cancelled,m.Returns,m.Return_Rate,m.Avg_Delivery_Days]);header(delivery,"A12:H12");table(delivery,`A12:H${12+monthly.length}`,"MonthlyDelivery");delivery.getRange(`G13:G${12+monthly.length}`).format.numberFormat="0.0%";delivery.getRange(`H13:H${12+monthly.length}`).format.numberFormat="0.00";delivery.freezePanes.freezeRows(4);
delivery.getRange("A4:A8").format.columnWidth=17;delivery.getRange("B4:G8").format.columnWidth=16;delivery.getRange("H4:H8").format.columnWidth=21;delivery.getRange("J4:J7").format.columnWidth=15;delivery.getRange("K4:N7").format.columnWidth=16;
const modeChart=delivery.charts.add("bar",[delivery.getRange("J4:J7"),delivery.getRange("M4:M7")]);modeChart.title="Return rate by delivery mode";modeChart.titleTextStyle.typeface=font;modeChart.titleTextStyle.fontSize=12;modeChart.hasLegend=false;modeChart.yAxis={numberFormatCode:"0%",numberFormatSourceLinked:false,textStyle:{typeface:font,fontSize:9}};modeChart.setPosition("J12","Q29");

const carRows=carrierStats.map(x=>{const c=carriers.find(y=>y.Carrier_Name===x.Carrier)||{};return {...x,Carrier_ID:c.Carrier_ID,Mode_Speciality:c.Mode_Speciality,On_Time_Percentage:c.On_Time_Percentage,Avg_Cost_per_km:c.Avg_Cost_per_km}});
const costVals=carriers.map(x=>x.Avg_Cost_per_km).filter(Number.isFinite), minC=Math.min(...costVals),maxC=Math.max(...costVals);
for(const r of carRows){r.High_Performance=(r.On_Time_Percentage||0)>95;r.Efficiency_Score=50*(r.On_Time_Percentage||0)+50*(1-((r.Avg_Cost_per_km-minC)/(maxC-minC)));}
const carrierSheet=sheetData("Carrier Analysis","Carrier performance and cost efficiency",carRows,["Carrier_ID","Carrier","Mode_Speciality","Shipments","Total_Cost","Avg_Delivery_Days","Delayed_Shipments","Returns","Return_Rate","On_Time_Percentage","Avg_Cost_per_km","High_Performance","Efficiency_Score"],"CarrierResults");
carrierSheet.getRange(`I5:I${carRows.length+4}`).format.numberFormat="0.0%";carrierSheet.getRange(`E5:E${carRows.length+4}`).format.numberFormat="#,##0";carrierSheet.getRange(`M5:M${carRows.length+4}`).format.numberFormat="0.0";

const custRows=custSeg.map(cleanRow);
const custSheet=sheetData("Customer Analysis","Customer activity, cost and recency",custRows,["Customer_ID","Customer_Name","Loyalty_Tier","Is_Active","Signup_Date","Shipments","Total_Cost","Returns","Return_Rate","First_Order_Date","Last_Order_Date","Days_Since_Last_Order","Churn_Risk_180d"],"CustomerResults");
custSheet.getRange(`G5:G${custRows.length+4}`).format.numberFormat="#,##0";custSheet.getRange(`I5:I${custRows.length+4}`).format.numberFormat="0.0%";custSheet.getRange(`E5:E${custRows.length+4}`).format.numberFormat="yyyy-mm-dd";custSheet.getRange(`J5:K${custRows.length+4}`).format.numberFormat="yyyy-mm-dd";

const rankings=wb.worksheets.add("Customer Rankings");title(rankings,"Customer rankings","Return-rate ranking includes customers with at least five shipments; volumes are shown beside rates.");
const rankHeaders=["Customer_ID","Customer_Name","Loyalty_Tier","Shipments","Total_Cost","Returns","Return_Rate"];
for(const [start, label, rows, tableName] of [["A","Top 10 by shipment volume",topByVolume,"TopCustomerVolume"],["I","Top 10 by total cost",topByCost,"TopCustomerCost"],["A","Top return rate (min. 5 shipments)",topByReturn,"TopCustomerReturnRate"]]){
  const r0=label.startsWith("Top return")?18:4;
  rankings.getRange(`${start}${r0}`).values=[[label]];rankings.getRange(`${start}${r0}`).format={font:{name:font,size:12,bold:true,color:navy}};
  const endCol=start==="A"?"G":"O";
  const startIdx=start==="A"?0:8;const headers=rankHeaders.map((_,i)=>col(startIdx+i));
  rankings.getRange(`${start}${r0+1}:${endCol}${r0+1}`).values=[rankHeaders];
  rankings.getRange(`${start}${r0+2}:${endCol}${r0+1+rows.length}`).values=rows.map(x=>[x.Customer_ID,x.Customer_Name,x.Loyalty_Tier,x.Shipments,x.Total_Cost,x.Returns,x.Return_Rate]);
  header(rankings,`${start}${r0+1}:${endCol}${r0+1}`);table(rankings,`${start}${r0+1}:${endCol}${r0+1+rows.length}`,tableName);
}
rankings.getRange("E6:E15").format.numberFormat="#,##0.00";rankings.getRange("G6:G15").format.numberFormat="0.0%";rankings.getRange("M6:M15").format.numberFormat="#,##0.00";rankings.getRange("O6:O15").format.numberFormat="0.0%";rankings.getRange("E20:E29").format.numberFormat="#,##0.00";rankings.getRange("G20:G29").format.numberFormat="0.0%";

const whRows=whStats.map(x=>{const w=warehouses.find(y=>y.Warehouse_Name===x.Warehouse)||{};return {...x,Warehouse_ID:w.Warehouse_ID,Capacity_Tonnes:w.Capacity_Tonnes,Region:w.Region}});
const warehouseSheet=sheetData("Warehouse Analysis","Warehouse and regional performance",whRows,["Warehouse_ID","Warehouse","Region","Capacity_Tonnes","Shipments","Delayed_Shipments","Cancelled_Shipments","Returns","Return_Rate","Avg_Delivery_Days","Total_Cost"],"WarehouseResults");
warehouseSheet.getRange(`I5:I${whRows.length+4}`).format.numberFormat="0.0%";

const dq=wb.worksheets.add("Data Quality");title(dq,"Data quality and metric definitions","Source: Logistics_SupplyChain_Analysis_Ready.xlsx. Date windows use the fixed source reference date.");
const quality=[
  ["Shipment rows",summary.shipment_count,"One row per Shipment_ID after preparation."],
  ["Duplicate Shipment_IDs",summary.duplicate_shipment_rows_removed,"None found; first occurrence is retained by the preparation script if introduced later."],
  ["Missing Delivery_Date",summary.missing_delivery_dates,"All correspond to cancelled shipments; left blank."],
  ["Cancelled with Delivery_Date",0,"No cancelled shipment has an assigned delivery date."],
  ["Unmatched Customer_ID",summary.unmatched_customer_ids,"All shipment customer keys match Customers."],
  ["Unmatched Warehouse_ID",summary.unmatched_warehouse_ids,"All shipment warehouse keys match Warehouses."],
  ["Unmatched Carrier_ID",summary.unmatched_carrier_ids,"All shipment carrier keys match Carriers."],
  ["Status = Delayed",summary.status_counts.Delayed,"Status field count; separate from elapsed delivery duration."],
  ["Elapsed duration > 7 days",summary.delayed_over_7_days,"2,627 are labelled Delivered and 303 are labelled Delayed."],
  ["Exact registered-city matches",0,"No exact destination/registered city matches; geography needs field-definition review."],
  ["Customer dimension active",summary.active_customers,"Source Is_Active flag, not a recency calculation."],
  ["Carriers over 500 shipments",0,"No carrier exceeds the assignment threshold; highest carrier volume is 445."],
  ["Analysis reference date",summary.as_of_date,"Maximum Order_Date; use for fixed 30-day and 180-day recency measures."],
  ["Cost currency","Not specified","Keep costs in source currency units; do not add a currency symbol."],
  ["Return-rate denominator","All shipments","Includes cancellations because the source gives no alternate denominator rule."]
];
dq.getRange(`A4:C${4+quality.length}`).values=[["Review item","Result","Interpretation"],...quality];header(dq,"A4:C4");table(dq,`A4:C${4+quality.length}`,"QualityReview");dq.getRange("A4:A20").format.columnWidth=30;dq.getRange("B4:B20").format.columnWidth=24;dq.getRange("C4:C20").format.columnWidth=90;dq.getRange(`C5:C${4+quality.length}`).format.wrapText=true;

const customerDim=customers.map(cleanRow), warehouseDim=warehouses.map(cleanRow), carrierDimRows=carriers.map(cleanRow);
const custDimSheet=sheetData("Customers","Customer dimension (contact details excluded)",customerDim,["Customer_ID","Customer_Name","Gender","Age","Sign_Up_Date","Loyalty_Tier","City","State","Is_Active"],"CustomersDim");
custDimSheet.getRange(`E5:E${customerDim.length+4}`).format.numberFormat="yyyy-mm-dd";
sheetData("Warehouses","Warehouse dimension",warehouseDim,["Warehouse_ID","Warehouse_Name","Region","City","State","Capacity_Tonnes","Is_Active"],"WarehousesDim");
sheetData("Carriers","Carrier dimension",carrierDimRows,["Carrier_ID","Carrier_Name","Mode_Speciality","Avg_Cost_per_km","On_Time_Percentage"],"CarriersDim");

const shipRows=shipments.map(cleanRow);
const shipSheet=sheetData("Shipment Detail","Prepared shipment fact table",shipRows,["Shipment_ID","Customer_ID","Order_Date","Dispatch_Date","Delivery_Date","Delivery_Status","Warehouse_ID","Carrier_ID","Delivery_Distance_km","Product_Weight_kg","Delivery_Mode","Cost_Incurred","Customer_City","Is_Returned","Dispatch_to_Delivery_Days","Order_to_Dispatch_Days","Cost_per_kg","Cost_per_km","Delivery_Month","Loyalty_Tier","Customer_Registered_City","Warehouse_Region","Warehouse_Name","Carrier_Name","Carrier_On_Time_Percentage","Is_Local_Delivery"],"ShipmentFact");
shipSheet.getRange(`C5:E${shipRows.length+4}`).format.numberFormat="yyyy-mm-dd";shipSheet.getRange(`L5:L${shipRows.length+4}`).format.numberFormat="#,##0.00";shipSheet.getRange(`Q5:R${shipRows.length+4}`).format.numberFormat="#,##0.00";shipSheet.getRange(`Z5:Z${shipRows.length+4}`).format.numberFormat="@";
shipSheet.getRange(`O5:O${shipRows.length+4}`).conditionalFormats.add("cellIs",{operator:"greaterThan",formula:7,format:{fill:amber,font:{color:"#7A4A00",bold:true}}});
shipSheet.getRange(`N5:N${shipRows.length+4}`).conditionalFormats.add("cellIs",{operator:"equal",formula:1,format:{fill:red,font:{color:"#9C2F2F",bold:true}}});

wb.recalculate();
const output=await SpreadsheetFile.exportXlsx(wb);await output.save(path.join(outDir,"Logistics_Supply_Chain_Analysis.xlsx"));
for(const [sheetName,range,file] of [["Overview","A1:Q64","overview.png"],["Delivery Analysis","A1:Q29","delivery.png"]]){
  try{const png=await wb.render({sheetName,range,scale:1,format:"png"});await fs.writeFile(path.join(outDir,file),new Uint8Array(await png.arrayBuffer()));}catch(e){console.warn("Preview skipped",sheetName,String(e));}
}
const check=await wb.inspect({kind:"workbook,sheet,table,drawing",maxChars:5000,tableMaxRows:3,tableMaxCols:6});
await fs.writeFile(path.join(outDir,"workbook_inspection.txt"),check.ndjson??JSON.stringify(check));
console.log("Saved workbook",path.join(outDir,"Logistics_Supply_Chain_Analysis.xlsx"));
