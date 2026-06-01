from __future__ import annotations

import json
import math
import re
import statistics
import warnings
from pathlib import Path

import openpyxl

warnings.filterwarnings("ignore", category=UserWarning, module="openpyxl")

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "web" / "degree_results_data.js"


def text(value) -> str:
    if value is None:
        return ""
    return str(value).replace("\n", " ").strip()


def is_number(value) -> bool:
    return isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value)


def year_label(path: Path) -> str:
    match = re.match(r"(\d{2})(\d{2})", path.name)
    if not match:
        return path.stem
    return f"20{match.group(1)}/20{match.group(2)}"


def year_code(path: Path) -> str:
    match = re.match(r"(\d{2})(\d{2})", path.name)
    return match.group(0) if match else path.stem


def level_number(title: str) -> int | None:
    if title.lower().startswith("foundation"):
        return 3
    match = re.search(r"(\d+)", title)
    return int(match.group(1)) if match else None


def is_overall_label(value: str) -> bool:
    normalized = value.lower().replace(" ", "")
    return normalized in {"o/all", "o/all%", "overall", "overall%", "total"}


def row_values(ws, row: int) -> list[str]:
    return [text(ws.cell(row, col).value) for col in range(1, ws.max_column + 1)]


def find_label_row(ws) -> int | None:
    best_row = None
    best_score = 0
    for row in range(1, min(ws.max_row, 12) + 1):
        values = row_values(ws, row)
        score = sum(1 for value in values if is_overall_label(value))
        score += sum(0.25 for value in values if value.lower() in {"cw", "exam", "cw1", "cw2", "prac", "assignment"})
        if score > best_score:
            best_row = row
            best_score = score
    return best_row if best_score > 0 else None


def plausible_module_name(value: str) -> bool:
    if not value:
        return False
    low = value.lower()
    if low in {"hide", "sem1", "sem2", "sem1&2", "o/all", "total"}:
        return False
    if re.fullmatch(r"[A-Z]{3,5}\d{4}[A-Z]?", value):
        return False
    if re.fullmatch(r"[A-Z&/ ]{1,8}", value) and len(value) <= 8:
        return False
    if re.fullmatch(r"\d+(\.\d+)?", value):
        return False
    return any(ch.isalpha() for ch in value)


def block_component_cols(ws, label_row: int, start_col: int, end_col: int) -> list[int]:
    cols = []
    for col in range(start_col, end_col):
        label = text(ws.cell(label_row, col).value).lower()
        if label and "course code" not in label and "hide" not in label:
            cols.append(col)
    return cols


def module_name(ws, label_row: int, start_col: int, end_col: int) -> str:
    component_cols = block_component_cols(ws, label_row, start_col, end_col)
    if component_cols:
        start_col = min(component_cols)
    candidates: list[str] = []
    for col in range(start_col, end_col + 1):
        joined = " ".join(
            text(ws.cell(row, col).value)
            for row in range(1, min(label_row, 4))
            if plausible_module_name(text(ws.cell(row, col).value))
        )
        if plausible_module_name(joined):
            candidates.append(joined)
    for row in range(1, label_row):
        for col in range(start_col, end_col + 1):
            value = text(ws.cell(row, col).value)
            if plausible_module_name(value):
                candidates.append(value)
    if candidates:
        return max(candidates, key=lambda item: (len(item.split()), len(item)))
    return f"Module {end_col}"


def module_code(ws, label_row: int, start_col: int, end_col: int) -> str:
    for row in range(1, label_row):
        for col in range(start_col, end_col + 1):
            value = text(ws.cell(row, col).value)
            match = re.search(r"\b[A-Z]{3,5}\d{4}[A-Z]?\b", value)
            if match:
                return match.group(0)
    return ""


def module_credits(formula_ws, value_ws, label_row: int, start_col: int, end_col: int, overall_col: int) -> float | None:
    value = value_ws.cell(label_row - 1, overall_col).value
    if is_number(value) and 5 <= float(value) <= 60:
        return float(value)
    total = 0.0
    for col in range(start_col, end_col + 1):
        value = value_ws.cell(label_row - 1, col).value
        if is_number(value) and 0 < float(value) <= 30:
            total += float(value)
    if total:
        return total
    name = module_name(formula_ws, label_row, start_col, end_col)
    match = re.search(r"\((\d{1,2})\)", name)
    if match:
        return float(match.group(1))
    return total or None


def clean_mark(value) -> float | None:
    if not is_number(value):
        return None
    mark = float(value)
    if 0 <= mark <= 100:
        return round(mark, 2)
    return None


def percent(values: list[float], threshold: float, op: str = "ge") -> float:
    if not values:
        return 0.0
    if op == "lt":
        return 100 * sum(1 for value in values if value < threshold) / len(values)
    return 100 * sum(1 for value in values if value >= threshold) / len(values)


def percentile(sorted_values: list[float], p: float) -> float:
    if not sorted_values:
        return 0.0
    if len(sorted_values) == 1:
        return sorted_values[0]
    idx = (len(sorted_values) - 1) * p
    low = math.floor(idx)
    high = math.ceil(idx)
    if low == high:
        return sorted_values[low]
    return sorted_values[low] + (sorted_values[high] - sorted_values[low]) * (idx - low)


def stats(values: list[float]) -> dict:
    values = sorted(values)
    if not values:
        return {
            "n": 0,
            "mean": None,
            "median": None,
            "stdev": None,
            "min": None,
            "max": None,
            "q1": None,
            "q3": None,
            "p10": None,
            "p90": None,
            "iqr": None,
            "ci95": None,
            "skew": None,
            "passRate": None,
            "failRate": None,
            "bandCounts": [0, 0, 0, 0, 0],
            "firstRate": None,
            "upperSecondRate": None,
        }
    mean = statistics.fmean(values)
    stdev = statistics.stdev(values) if len(values) > 1 else 0
    q1 = percentile(values, 0.25)
    q3 = percentile(values, 0.75)
    centred = [value - mean for value in values]
    skew = None
    if len(values) > 2 and stdev:
        skew = sum(value**3 for value in centred) / len(values) / (stdev**3)
    return {
        "n": len(values),
        "mean": round(mean, 1),
        "median": round(statistics.median(values), 1),
        "stdev": round(stdev, 1),
        "min": round(values[0], 1),
        "max": round(values[-1], 1),
        "q1": round(q1, 1),
        "q3": round(q3, 1),
        "p10": round(percentile(values, 0.10), 1),
        "p90": round(percentile(values, 0.90), 1),
        "iqr": round(q3 - q1, 1),
        "ci95": round(1.96 * stdev / math.sqrt(len(values)), 1) if len(values) > 1 else 0,
        "skew": round(skew, 2) if skew is not None else None,
        "passRate": round(percent(values, 40), 1),
        "failRate": round(percent(values, 40, "lt"), 1),
        "bandCounts": [
            sum(1 for value in values if value < 40),
            sum(1 for value in values if 40 <= value < 50),
            sum(1 for value in values if 50 <= value < 60),
            sum(1 for value in values if 60 <= value < 70),
            sum(1 for value in values if value >= 70),
        ],
        "firstRate": round(percent(values, 70), 1),
        "upperSecondRate": round(percent(values, 60), 1),
    }


def extract_sheet(formula_ws, value_ws, workbook_path: Path) -> list[dict]:
    label_row = find_label_row(formula_ws)
    if not label_row:
        return []
    overall_cols = [
        col
        for col in range(1, formula_ws.max_column + 1)
        if is_overall_label(text(formula_ws.cell(label_row, col).value))
    ]
    modules: list[dict] = []
    previous_overall = 0
    for overall_col in overall_cols:
        start_col = previous_overall + 1
        end_col = overall_col
        previous_overall = overall_col

        name = module_name(formula_ws, label_row, start_col, end_col)
        credits = module_credits(formula_ws, value_ws, label_row, start_col, end_col, overall_col)
        marks: list[float] = []
        for row in range(label_row + 1, formula_ws.max_row + 1):
            component_marks = [
                clean_mark(value_ws.cell(row, col).value)
                for col in range(start_col, end_col)
                if not is_overall_label(text(formula_ws.cell(label_row, col).value))
            ]
            component_marks = [mark for mark in component_marks if mark is not None]
            overall = clean_mark(value_ws.cell(row, overall_col).value)
            if component_marks and overall is not None and overall > 0:
                marks.append(overall)
        if not marks:
            continue
        modules.append(
            {
                "year": year_label(workbook_path),
                "yearCode": year_code(workbook_path),
                "level": formula_ws.title,
                "levelNumber": level_number(formula_ws.title),
                "module": name,
                "code": module_code(formula_ws, label_row, start_col, end_col),
                "credits": credits,
                "overallColumn": overall_col,
                "marks": marks,
                "stats": stats(marks),
            }
        )
    return modules


def main() -> None:
    all_modules: list[dict] = []
    for path in sorted(ROOT.glob("*.xlsx")):
        formula_wb = openpyxl.load_workbook(path, data_only=False)
        value_wb = openpyxl.load_workbook(path, data_only=True)
        for formula_ws in formula_wb.worksheets:
            value_ws = value_wb[formula_ws.title]
            all_modules.extend(extract_sheet(formula_ws, value_ws, path))

    payload = {
        "sourceFiles": [path.name for path in sorted(ROOT.glob("*.xlsx"))],
        "generated": "2026-06-01",
        "modules": all_modules,
    }
    OUT.parent.mkdir(exist_ok=True)
    OUT.write_text(
        "window.DEGREE_RESULTS_DATA = "
        + json.dumps(payload, indent=2)
        + ";\n",
        encoding="utf-8",
    )
    print(f"Extracted {len(all_modules)} module-year records to {OUT}")


if __name__ == "__main__":
    main()
