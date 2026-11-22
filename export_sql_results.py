"""Run every SELECT in SQL_Analysis.sql against the included SQLite database."""
import csv, re, sqlite3
from pathlib import Path

root=Path(__file__).resolve().parent
sql=(root/"SQL_Analysis.sql").read_text(encoding="utf-8")
out=root/"analysis"/"SQL_Query_Results"
out.mkdir(parents=True,exist_ok=True)
db=sqlite3.connect(root/"logistics_analysis.db")
statements=[]; current=[]
for line in sql.splitlines():
    current.append(line)
    candidate="\n".join(current)
    if sqlite3.complete_statement(candidate):
        if re.search(r"\b(SELECT|WITH)\b",candidate,re.I): statements.append(candidate)
        current=[]
if any(line.strip() for line in current): raise RuntimeError("SQL file ends with an incomplete statement")
for i,stmt in enumerate(statements,1):
    title=next((m.group(1).strip() for line in stmt.splitlines() if (m:=re.match(r"\s*--\s*(.+)",line))),f"query_{i}")
    slug=re.sub(r"[^a-z0-9]+","_",title.lower()).strip("_")[:64]
    cur=db.execute(stmt)
    fields=[d[0] for d in cur.description or []]
    rows=cur.fetchall()
    with (out/f"{i:02d}_{slug}.csv").open("w",newline="",encoding="utf-8-sig") as f:
        w=csv.writer(f);w.writerow(fields);w.writerows(rows)
    print(f"{i:02d} {title}: {len(rows)} row(s)")
db.close()
