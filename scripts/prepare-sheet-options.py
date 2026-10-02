"""Deploy an authenticated Sheets dropdown catalog using the existing OAuth credential.
No document rows/values are written. Only user-requested dropdown additions write validation.
"""
import json
import pathlib
from pathlib import Path
import sqlite3
import urllib.parse
import uuid
import importlib.util
spec = importlib.util.spec_from_file_location("pilot", Path(__file__).with_name("prepare-n8n-web-pilot.py"))
pilot = importlib.util.module_from_spec(spec); spec.loader.exec_module(pilot)

def main():
    db = sqlite3.connect(pilot.DATABASE, uri=True)
    key = db.execute('select apiKey from user_api_keys limit 1').fetchone()[0]
    manifest_path = pilot.PRIVATE / 'manifest.json'
    manifest = json.loads(manifest_path.read_text(encoding='utf-8'))
    original = pilot.api(key, 'GET', '/workflows/' + manifest['workflows']['cheques']['id'])
    credential = next(n['credentials']['googleSheetsOAuth2Api'] for n in original['nodes'] if 'googleSheetsOAuth2Api' in n.get('credentials', {}))
    nodes, connections = [], {}
    def add(name, typ, params, version=1, x=0, y=0):
        n = pilot.new_node(name, typ, params, version, x, y); nodes.append(n); return n
    def link(a, b, output=0):
        outputs = connections.setdefault(a, {'main': []})['main']
        while len(outputs) <= output: outputs.append([])
        outputs[output].append({'node': b, 'type': 'main', 'index': 0})
    hook = add('Webhook listas', 'n8n-nodes-base.webhook', {'httpMethod':'POST','path':'web/sheet-options/v1','authentication':'headerAuth','responseMode':'responseNode','options':{}},2)
    hook['credentials']={'httpHeaderAuth':manifest['credential']}
    hook['webhookId']=str(uuid.uuid4())
    prepare = add('Validar solicitud', 'n8n-nodes-base.code', {'jsCode':"""
const input = $input.first().json.body ?? {};
const fields = ['CLIENTE / INGRESADO POR:', 'ESTADO DEL CHEQUE', 'EMPRESA'];
if (input.module !== 'cheques' || !['read','add'].includes(input.action)) throw new Error('Solicitud inválida');
if (input.action === 'add' && (!fields.includes(input.field) || typeof input.value !== 'string' || !input.value.trim() || input.value.length > 100 || /[\\r\\n\\x00]/.test(input.value))) throw new Error('Opción inválida');
return [{json:{...input,value:input.value?.trim()}}];
"""},2,240)
    query = urllib.parse.urlencode([
        ('ranges', "'Hoja 1'!H2:M997"),
        ('fields','spreadsheetId,sheets(properties(sheetId,title),data(startRow,startColumn,rowData(values(dataValidation))))'),
    ])
    url = 'https://sheets.googleapis.com/v4/spreadsheets/1w5CqAvC4XW3m6K-_GOFodyl_FPnUccMqXS-P8k2vL3k'
    def read(name,x,y=0):
        n = add(name,'n8n-nodes-base.httpRequest', {'url':url+'?'+query,'authentication':'predefinedCredentialType','nodeCredentialType':'googleSheetsOAuth2Api','options':{'timeout':20000}},4.2,x,y)
        n['credentials']={'googleSheetsOAuth2Api':credential}; return n
    read('Leer listas de Sheets',480)
    planner = Path(__file__).with_name('n8n-sheet-options.js').read_text(encoding='utf-8').replace('export function','function')
    add('Preparar actualización', 'n8n-nodes-base.code', {'jsCode':planner+"\nreturn [{json:planOptions($input.first().json, $('Validar solicitud').first().json)}];"},2,720)
    add('Hay cambios', 'n8n-nodes-base.if', {'conditions':{'options':{'caseSensitive':True,'typeValidation':'strict','version':2},'conditions':[{'id':'changes','leftValue':'={{ $json.requests.length }}','rightValue':0,'operator':{'type':'number','operation':'gt'}}],'combinator':'and'},'options':{}},2.2,960)
    write = add('Agregar opción en validación', 'n8n-nodes-base.httpRequest', {'method':'POST','url':url+':batchUpdate','authentication':'predefinedCredentialType','nodeCredentialType':'googleSheetsOAuth2Api','sendBody':True,'specifyBody':'json','jsonBody':'={{ {requests: $json.requests} }}','options':{'timeout':20000}},4.2,1200,-140)
    write['credentials']={'googleSheetsOAuth2Api':credential}
    read('Verificar listas actualizadas',1440,-140)
    add('Verificar opción', 'n8n-nodes-base.code', {'jsCode':planner+"""
const input = $('Validar solicitud').first().json;
const result = planOptions($input.first().json, {action:'read'});
if (!result.options[input.field]?.includes(input.value)) throw new Error('No se pudo verificar la nueva opción');
return [{json:result}];
"""},2,1680,-140)
    add('Responder listas', 'n8n-nodes-base.respondToWebhook', {'respondWith':'json','responseBody':'={{ {options:$json.options} }}','options':{'responseCode':200}},1.4,1920)
    add('Responder error', 'n8n-nodes-base.respondToWebhook', {'respondWith':'json','responseBody':'={{ {message:"No pudimos consultar o actualizar la lista de Sheets"} }}','options':{'responseCode':502}},1.4,960,300)
    link('Webhook listas','Validar solicitud');link('Validar solicitud','Leer listas de Sheets');link('Leer listas de Sheets','Preparar actualización');link('Preparar actualización','Hay cambios')
    link('Hay cambios','Agregar opción en validación');link('Hay cambios','Responder listas',1);link('Agregar opción en validación','Verificar listas actualizadas');link('Verificar listas actualizadas','Verificar opción');link('Verificar opción','Responder listas')
    for n in nodes:
        if n['type'] in ['n8n-nodes-base.code','n8n-nodes-base.httpRequest']:
            n['onError']='continueErrorOutput';link(n['name'],'Responder error',1)
    workflow={'name':'Labruna Web - Listas de Google Sheets','nodes':nodes,'connections':connections,'settings':{'executionOrder':'v1','saveDataSuccessExecution':'all','saveDataErrorExecution':'all'}}
    id=manifest.get('sheetOptionsWorkflow')
    if id:
        state=pilot.api(key,'GET','/workflows/'+id)
        if state['active']:pilot.api(key,'POST','/workflows/'+id+'/deactivate')
        pilot.api(key,'PUT','/workflows/'+id,workflow)
    else:
        state=pilot.api(key,'POST','/workflows',workflow);id=state['id']
        manifest['sheetOptionsWorkflow']=id;manifest_path.write_text(json.dumps(manifest,indent=2),encoding='utf-8')
    pilot.api(key,'POST','/workflows/'+id+'/activate')
    env_path=pathlib.Path('C:/ProgramData/Labruna/.env')
    env=env_path.read_text(encoding='utf-8').splitlines();env=[line for line in env if not line.startswith('N8N_SHEET_OPTIONS_URL=')]
    base=next(line.split('=',1)[1] for line in env if line.startswith('N8N_REMITOS_ANALYZE_URL=')).split('/webhook/')[0]
    env.append('N8N_SHEET_OPTIONS_URL='+base+'/webhook/web/sheet-options/v1');env_path.write_text('\n'.join(env)+'\n',encoding='utf-8')
    print(json.dumps({'id':id,'name':workflow['name'],'active':True,'documentRowsWritten':False}))

if __name__=='__main__':main()
