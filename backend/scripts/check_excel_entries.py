# -*- coding: utf-8 -*-
"""Show raw event types for 5-1 NC-8000 entries from Excel."""
import os
import sys
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import pandas as pd

path = r"c:\Users\Darly\Downloads"
xlsx = [n for n in os.listdir(path) if n.endswith(".xlsx") and "2025" in n and not n.startswith("~")]
f = [n for n in xlsx if "1)(2) (1).xlsx" in n]
if not f:
    f = xlsx
full = os.path.join(path, f[0])
# Read without header to find header row
raw = pd.read_excel(full, engine="openpyxl", dtype=str, header=None)
for i, row in raw.head(15).iterrows():
    print(i, list(row.values))
print("---")
# Use same logic as parser: find row with most alias matches
from app.services.excel_parser import _ALL_ALIASES
best_row, best_score = 0, 0
for row_idx, row in raw.head(20).iterrows():
    score = sum(1 for c in row if isinstance(c, str) and c.lower().strip() in _ALL_ALIASES)
    if score > best_score:
        best_score, best_row = score, int(row_idx)
print("Header row index:", best_row)
df = pd.read_excel(full, engine="openpyxl", dtype=str, header=best_row)
print("Columns:", list(df.columns))
cols = {str(c).lower().strip(): c for c in df.columns}
ev_col = next((cols[k] for k in ["событие", "event_type", "тип"] if k in cols), None)
time_col = next((cols[k] for k in ["время", "event_time", "дата"] if k in cols), None)
cp_col = next((cols[k] for k in ["точка", "checkpoint", "источник"] if k in cols), None)
name_col = next((cols[k] for k in ["фио", "raw_name", "субъект"] if k in cols), None)
if not ev_col or not cp_col:
    sys.exit(1)
sub = df[df[cp_col].astype(str).str.contains("5-1 NC-8000", na=False)]
entry_keys = ["вход", "нормальный вход", "считывание карты на входе", "открытие двери на вход", "вход по ключу"]
sub = sub[sub[ev_col].astype(str).str.lower().str.strip().isin([t.lower() for t in entry_keys])]
print("Rows for 5-1 NC-8000 with entry-like event:", len(sub))
print(sub[[time_col, name_col, ev_col]].to_string())
print()
print("Event type value_counts:")
print(sub[ev_col].value_counts())
