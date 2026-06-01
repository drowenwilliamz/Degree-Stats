from __future__ import annotations

import glob

import openpyxl


def clean(value):
    if value is None:
        return ""
    text = str(value).replace("\n", " ").strip()
    return text[:70]


for path in sorted(glob.glob("*.xlsx")):
    print(f"\n=== {path} ===")
    wb = openpyxl.load_workbook(path, read_only=True, data_only=False)
    for ws in wb.worksheets:
        print(f"\n-- {ws.title} ({ws.max_row}x{ws.max_column}) --")
        for row in ws.iter_rows(min_row=1, max_row=min(14, ws.max_row), values_only=True):
            cells = [clean(v) for v in row[: min(ws.max_column, 16)]]
            if any(cells):
                print(" | ".join(cells))
