"""Replace one year without requiring or changing other years' workbooks."""
from __future__ import annotations
import argparse
import hashlib
import json
import re
from pathlib import Path
import openpyxl
import extract_degree_results as ex

def normalized(name):
    return re.sub(r"\b[A-Z]{3,5}\d{4}[A-Za-z]?\b", "", name).strip().casefold()

def replace(workbook, data_path, imported):
    original_text = data_path.read_text(encoding='utf-8-sig')
    original = json.loads(original_text.split('=', 1)[1].strip().rstrip(';'))
    year = ex.year_code(workbook)
    previous = [r for r in original['modules'] if r['yearCode'] == year]
    if not previous:
        raise ValueError(f'No existing year {year}; refusing a replacement')
    formulas = openpyxl.load_workbook(workbook, data_only=False)
    values = openpyxl.load_workbook(workbook, data_only=True)
    records=[]
    for sheet in formulas:
        records.extend(ex.extract_sheet(sheet, values[sheet.title], workbook))
    if not records:
        raise ValueError('Workbook produced no records')
    used=set()
    for record in records:
        candidates=[r for r in previous if r['level']==record['level'] and (
            (r['code'] and r['code']==record['code']) or normalized(r['module'])==normalized(record['module']))]
        if len(candidates)>1:
            raise ValueError(f'Ambiguous module match: {record["module"]}')
        record['sourceCode']=record['code']
        if candidates:
            old=candidates[0]
            used.add((old['level'],old['code'],old['module']))
            # Preserve established chart identities, including older missing codes.
            record['code'],record['module']=old['code'],old['module']
        record['sourceFile']=workbook.name
        record['assessmentStage']='Post-resit'
    expected={(r['level'],r['code'],r['module']) for r in previous}
    if used!=expected:
        raise ValueError(f'Modules missing from replacement: {expected-used}')
    keys=[(r['level'],r['code'] or r['module']) for r in records]
    if len(keys)!=len(set(keys)):
        raise ValueError('Duplicate replacement modules')
    result=dict(original)
    result['modules']=[r for r in original['modules'] if r['yearCode']!=year]+records
    result['sourceFiles']=[f for f in original['sourceFiles'] if not f.startswith(year)]+[workbook.name]
    result['generated']=imported
    result['yearSources']={**original.get('yearSources',{}),year:{
        'file':workbook.name,'assessmentStage':'Post-resit','imported':imported,
        'sha256':hashlib.sha256(workbook.read_bytes()).hexdigest(),
        'extraction':'Summary rows excluded; existing nonzero numeric-mark inclusion rule retained'}}
    result['comparisonNote']='2025/2026 uses post-resit results with summary rows excluded. Earlier years retain the legacy extraction and require source-workbook checks for summary-row contamination and assessment stage; differences are descriptive, not like-for-like progression comparisons.'
    assert [r for r in result['modules'] if r['yearCode']!=year]==[r for r in original['modules'] if r['yearCode']!=year]
    data_path.write_text('window.DEGREE_RESULTS_DATA = '+json.dumps(result,indent=2)+';\n',encoding='utf-8')
    for level in sorted({r['level'] for r in records}):
        items=[r for r in records if r['level']==level]
        print(level,len(items),'modules',sum(len(r['marks']) for r in items),'marks')
    for r in records:
        if r['level']=='Level 5':
            print(r['module'],r['stats']['n'],sum(x<40 for x in r['marks']),r['stats']['failRate'])

if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('workbook',type=Path)
    parser.add_argument('--data',type=Path,default=ex.OUT)
    parser.add_argument('--imported',required=True,help='Import date, YYYY-MM-DD')
    args=parser.parse_args()
    replace(args.workbook,args.data,args.imported)
