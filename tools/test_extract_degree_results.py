"""Regression check: footer statistics must never become student marks."""
from pathlib import Path
import openpyxl
from openpyxl.worksheet.formula import ArrayFormula
from extract_degree_results import extract_sheet

formulas=openpyxl.Workbook().active
values=openpyxl.Workbook().active
for ws in (formulas,values):
    ws.title='Level 5'
    ws['B2']='Example module'
    ws['B3']='ACHA4022a'
    ws['B6']=20;ws['C6']=20
    ws['B7']='CW';ws['C7']='O/All'
    for row,mark in ((9,35),(10,65),(11,0)):
        ws.cell(row,2,mark);ws.cell(row,3,mark)
    for row,mark in ((12,1),(13,50),(14,15)):
        ws.cell(row,2,mark);ws.cell(row,3,mark)
formulas['C12']='=COUNTIFS(C9:C11,">0",C9:C11,"<40")'
formulas['C13']='=AVERAGEIF(C9:C11,"<>0")'
formulas['C14']=ArrayFormula(ref='C14',text='=_xlfn.STDEV.P(IF(C9:C11>0,C9:C11))')
records=extract_sheet(formulas,values,Path('2526.xlsx'))
assert len(records)==1
assert records[0]['marks']==[35,65]
assert records[0]['stats']['n']==2
assert records[0]['stats']['failRate']==50
assert records[0]['code']=='ACHA4022a'
print('PASS: summary rows excluded, zero policy retained, lowercase module suffix read.')
