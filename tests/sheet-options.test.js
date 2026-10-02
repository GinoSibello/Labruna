import { describe, expect, it } from 'vitest';
import { planOptions } from '../scripts/n8n-sheet-options.js';
const rule = values => ({condition:{type:'ONE_OF_LIST',values:values.map(userEnteredValue => ({userEnteredValue}))}, strict:true, showCustomUi:true});
const spreadsheet = () => ({sheets:[{properties:{sheetId:0,title:'Hoja 1'},data:[{startRow:1,startColumn:7,rowData:[
  {values:[{dataValidation:rule(['A','A'])},{dataValidation:rule(['CARTERA'])},{},{},{},{dataValidation:rule(['LABRUNA'])}]},
  {values:[{dataValidation:rule(['B'])},{dataValidation:rule(['CARTERA'])},{},{},{},{dataValidation:rule(['LABRUNA'])}]},
]}]}]});
describe('live Sheets validation planner', () => {
  it('reads the union of real options and does not write on read or duplicate additions', () => {
    const result = planOptions(spreadsheet(),{action:'read'});
    expect(result.options['CLIENTE / INGRESADO POR:']).toEqual(['A','B']);
    expect(result.requests).toEqual([]);
    expect(planOptions(spreadsheet(),{action:'add',field:'EMPRESA',value:'LABRUNA'}).requests).toEqual([]);
  });
  it('extends only the requested validation, preserving rules, variants and cell contents', () => {
    const data=spreadsheet();const before=structuredClone(data);
    const result=planOptions(data,{action:'add',field:'CLIENTE / INGRESADO POR:',value:'NUEVO'});
    expect(data).toEqual(before);
    expect(result.requests).toHaveLength(2);
    expect(result.requests[0].setDataValidation.rule.condition.values.map(v=>v.userEnteredValue)).toEqual(['A','A','NUEVO']);
    expect(result.requests[1].setDataValidation.rule.condition.values.map(v=>v.userEnteredValue)).toEqual(['B','NUEVO']);
    for (const request of result.requests) {
      expect(Object.keys(request)).toEqual(['setDataValidation']);
      expect(request.setDataValidation.range.startColumnIndex).toBe(7);
      expect(request.setDataValidation.rule.strict).toBe(true);
    }
  });
});
