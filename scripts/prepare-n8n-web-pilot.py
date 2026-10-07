"""Create reviewable, inactive web pilots using n8n's public API.

Original workflows and credentials are read without exporting credential secrets.
Confirmations return a preview with HTTP 409; production writes require a separate
validated migration. This is intentionally not a production cutover script.
"""
import copy
import json
import pathlib
import sqlite3
import urllib.request
import uuid

ROOT = pathlib.Path(__file__).resolve().parents[1]
PRIVATE = pathlib.Path("C:/ProgramData/Labruna/n8n-web-pilot")
DATABASE = "file:C:/n8n-data/.n8n/database.sqlite?mode=ro"
API = "http://127.0.0.1:5678/api/v1"
SOURCES = {
    "remitos": "RemitosFacturasV3.4",
    "chapas": "ChapasV2",
    "cheques": "Cheques",
}

PREPARE = r"""
const item = $input.first();
const body = item.json.body ?? {};
if (body.source !== 'web' || body.module !== MODULE ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(body.requestId ?? '') ||
    !String(body.userId ?? '').trim()) throw new Error('Solicitud web inválida');
const files = Object.values(item.binary ?? {});
if (files.length !== 1) throw new Error('Se requiere un archivo');
const file = files[0];
if (!['image/jpeg','image/png','image/webp','application/pdf'].includes(body.mimeType) ||
    file.mimeType !== body.mimeType) throw new Error('Formato de archivo inválido');
return [{json: {...body}, binary: {data: file}}];
"""

PARSE = r"""
const first = $input.first().json;
let text = first.candidates?.[0]?.content?.parts?.map(p => p.text ?? '').join('\n') ?? first.text;
if (typeof text !== 'string') throw new Error('Gemini no devolvió texto');
text = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
let parsed = JSON.parse(text);
if (Array.isArray(parsed)) {
  if (parsed.length !== 1) throw new Error('Cargá un solo documento por solicitud');
  parsed = parsed[0];
}
if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('Respuesta inválida');
function isoDate(value) {
  const raw = String(value ?? '').trim();
  const m = raw.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  const iso = m ? `${m[3]}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}` : raw;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) throw new Error('Fecha inválida');
  const date = new Date(`${iso}T00:00:00Z`);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0,10) !== iso) throw new Error('Fecha inválida');
  return iso;
}
if (MODULE === 'cheques') {
  parsed.numero_cheque = String(parsed.numero_cheque ?? '').trim();
  if (!/^\d{8}$/.test(parsed.numero_cheque)) throw new Error('El cheque debe tener ocho dígitos');
  parsed.fecha_pago_diferido = isoDate(parsed.fecha_pago_diferido);
  if (parsed.fecha_emision) parsed.fecha_emision = isoDate(parsed.fecha_emision);
  if (!/^\d+(\.\d{1,2})?$/.test(String(parsed.monto_numeros))) throw new Error('Monto inválido');
  if (typeof parsed.endosos === 'string') parsed.endosos = [parsed.endosos];
}
if (MODULE === 'chapas' && parsed.desarrollo && typeof parsed.desarrollo === 'object')
  throw new Error('Este plano contiene varios desarrollos; el formulario debe ampliarse antes de guardarlo');
if (!String(parsed[KEY] ?? '').trim()) throw new Error('Falta la clave del documento');
return [{json: parsed}];
"""

CONFIRM = r"""
const item = $input.first();
const body = item.json.body ?? {};
if (body.source !== 'web' || body.module !== MODULE ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(body.requestId ?? '') ||
    !String(body.userId ?? '').trim()) throw new Error('Solicitud web inválida');
const data = JSON.parse(body.data);
const recordKey = MODULE === 'remitos' ? data?.rows?.[0]?.['N° de Comprobante'] : data?.[MODULE === 'chapas' ? 'N° POLO' : 'Nº DE CHEQUE'];
if (!data || typeof data !== 'object' || Array.isArray(data) || !String(recordKey ?? '').trim())
  throw new Error('Datos de confirmación inválidos');
return [{json: {requestId:body.requestId, userId:body.userId, module:MODULE,
  recordKey:String(recordKey), data, writesEnabled:false}, binary:item.binary}];
"""

def new_node(name, typ, parameters, version=1, x=0, y=0):
    return {"id": str(uuid.uuid4()), "name": name, "type": typ,
            "typeVersion": version, "position": [x, y], "parameters": parameters}


def code(name, text, module, key, x, y):
    prefix = f"const MODULE={json.dumps(module)}, KEY={json.dumps(key)};\n"
    return new_node(name, "n8n-nodes-base.code", {"jsCode": prefix + text}, 2, x, y)


def api(key, method, path, payload=None):
    headers = {"X-N8N-API-KEY": key}
    data = None
    if payload is not None:
        headers["Content-Type"] = "application/json"
        data = json.dumps(payload).encode()
    req = urllib.request.Request(API + path, data=data, headers=headers, method=method)
    with urllib.request.urlopen(req, timeout=30) as response:
        return json.load(response)


def build(module, source, credential):
    key = {"remitos":"comprobante_numero", "chapas":"N_POLO", "cheques":"numero_cheque"}[module]
    original = {n["name"]: n for n in source["nodes"]}
    nodes, connections = [], {}

    def add(node):
        nodes.append(node)
        return node["name"]

    def link(left, right, output=0):
        outputs = connections.setdefault(left, {"main": []})["main"]
        while len(outputs) <= output:
            outputs.append([])
        outputs[output].append({"node": right, "type": "main", "index": 0})

    def webhook(action, y):
        node = new_node("Webhook " + action, "n8n-nodes-base.webhook", {
            "httpMethod":"POST", "path":f"web/{module}/{action}/v1",
            "authentication":"headerAuth", "responseMode":"responseNode", "options":{},
        }, 2, 0, y)
        node["webhookId"] = str(uuid.uuid4())
        node["credentials"] = {"httpHeaderAuth":credential}
        return add(node)

    def response(name, body, status, x, y):
        return add(new_node(name, "n8n-nodes-base.respondToWebhook", {
            "respondWith":"json", "responseBody":body,
            "options":{"responseCode":status},
        }, 1.4, x, y))

    def clone(name, x, y):
        node = copy.deepcopy(original[name])
        node["id"] = str(uuid.uuid4())
        node["position"] = [x,y]
        for field in ["onError","continueOnFail","disabled"]:
            node.pop(field, None)
        return node

    wa = webhook("analyze", 0)
    prepare = add(code("Preparar archivo web", PREPARE, module, key, 240, 0))
    ai_name = "Analizar comprobante IA" if module == "remitos" else "Analyze image"
    ai = clone(ai_name, 480, 0)
    ai["parameters"]["binaryPropertyName"] = "data"
    ai["parameters"]["resource"] = "={{ $('Preparar archivo web').first().json.mimeType === 'application/pdf' ? 'document' : 'image' }}"
    ai["parameters"]["text"] += "\nProcesá un solo documento y devolvé un único objeto JSON, sin markdown."
    ai["onError"] = "continueErrorOutput"
    add(ai)
    if module == "remitos":
        parser_node = clone("Parsear respuesta IA", 720, 0)
        parser_node["onError"] = "continueErrorOutput"
        parser = add(parser_node)
        normalization_node = clone("Normalizar comprobante", 840, 0)
        normalization_node["onError"] = "continueErrorOutput"
        parsed = add(normalization_node)
        link(parser, parsed)
    else:
        parser = parsed = add(code("Normalizar análisis web", PARSE, module, key, 720, 0))
    query_node = clone("Get row(s) in sheet", 960, 0) if module == "chapas" else clone(
        "Guardar items en Sheets" if module == "remitos" else "Append or update row in sheet2", 960, 0)
    query_node["name"] = "Consultar documento existente"
    parameters = query_node["parameters"]
    parameters.pop("columns", None)
    parameters["operation"] = "read"
    column = {"remitos":"N° de Comprobante", "chapas":"N° POLO", "cheques":"Nº DE CHEQUE"}[module]
    parameters["filtersUI"] = {"values":[{"lookupColumn":column, "lookupValue":f"={{{{ $json.{key} }}}}"}]}
    parameters["options"] = {}
    query_node["alwaysOutputData"] = True
    query_node["onError"] = "continueErrorOutput"
    add(query_node)
    result = add(code("Resultado de análisis", "const data = $(" + json.dumps(parsed) + ").first().json;\n" + """
const found = $input.all().some(i => i.json.row_number != null);
return [{json:{operation:found?'update':'create',data,warnings:[
  'Piloto: la confirmación todavía no escribe en Sheets ni Drive.'
]}}];
""", module, key, 1200, 0))
    ok = response("Responder análisis JSON", "={{ $json }}", 200, 1440, 0)
    error = response("Responder error de integración", '={{ {message:"El procesamiento o la consulta no pudo completarse"} }}', 502, 960, -240)
    invalid = response("Responder entrada inválida", '={{ {message:"El documento o los datos no son compatibles con este piloto"} }}', 422, 480, -240)
    for name in set([prepare, parser, parsed]):
        next(n for n in nodes if n["name"] == name)["onError"] = "continueErrorOutput"
        link(name,invalid,1)
    link(wa,prepare); link(prepare,ai_name); link(ai_name,parser)
    link(ai_name,error,1); link(parsed,query_node["name"]); link(query_node["name"],result)
    link(query_node["name"],error,1); link(result,ok)

    wc = webhook("confirm", 600)
    confirm = add(code("Validar confirmación web", CONFIRM, module, key, 240, 600))
    preview = code("Vista previa sin guardar", """
const input = $input.first().json;
return [{json:{message:'Piloto: el guardado real está pendiente de validación. No se escribió en Sheets ni Drive.',
  requestId:input.requestId,recordKey:input.recordKey,preview:input.data,writesEnabled:false}}];
""", module, key, 480, 600)
    add(preview)
    pending = response("Responder guardado pendiente", "={{ $json }}", 409, 720, 600)
    link(wc,confirm); link(confirm,preview["name"]); link(preview["name"],pending)
    next(n for n in nodes if n["name"] == confirm)["onError"] = "continueErrorOutput"
    link(confirm,invalid,1)

    # Preserve source persistence nodes for review, disabled and disconnected.
    # This makes their exact mappings visible without accidentally writing during a pilot.
    persistence = []
    if module == "remitos":
        persistence = ["Preparar items","Separar items","Guardar items en Sheets"]
    elif module == "chapas":
        persistence = ["Code","HTTP Request1","Upload file","Merge1","Append or update row in sheet"]
    else:
        persistence = ["Variables Fechas","Append or update row in sheet2","Variables Fechas1","Append or update row in sheet4"]
    for index,name in enumerate(persistence):
        node = clone(name, index*280, 1000)
        node["disabled"] = True
        node["notes"] = "Referencia del original. Pendiente adaptar y probar guardado, claves, fechas e idempotencia."
        node["notesInFlow"] = True
        add(node)
    add(new_node("Estado del piloto", "n8n-nodes-base.stickyNote", {
        "content":f"## Labruna Web — {module}\nCopia de {source['name']}.\nAnálisis: archivo multipart, Gemini, consulta y JSON. Remitos admite REMITO y FACTURA con comprobante_numero.\nConfirmación: vista previa HTTP 409; NO guarda.\nLos nodos inferiores conservan los mappings originales, incluida la columna Comprobante, para revisión.\nPendiente validar guardado y reintentos antes del corte.",
        "height":300,"width":600,
    }, 1, 0, -480))
    return {"name":f"Labruna Web PILOTO - {module.capitalize()}", "nodes":nodes,
            "connections":connections, "settings":{"executionOrder":"v1",
            "saveDataSuccessExecution":"all", "saveDataErrorExecution":"all",
            "saveManualExecutions":True}}


def main():
    PRIVATE.mkdir(parents=True, exist_ok=True)
    db = sqlite3.connect(DATABASE, uri=True)
    api_key = db.execute("select apiKey from user_api_keys limit 1").fetchone()[0]
    sources = {}
    for module,name in SOURCES.items():
        row = db.execute("select id from workflow_entity where name=?",(name,)).fetchone()
        source = api(api_key,"GET","/workflows/"+row[0])
        (PRIVATE/(module+"-original.json")).write_text(json.dumps(source,ensure_ascii=False,indent=2),encoding="utf-8")
        sources[module] = source
    manifest_path = PRIVATE/"manifest.json"
    manifest = json.loads(manifest_path.read_text(encoding="utf-8")) if manifest_path.exists() else {}
    if "credential" not in manifest:
        env = dict(line.split("=",1) for line in pathlib.Path("C:/ProgramData/Labruna/.env").read_text().splitlines() if "=" in line and not line.startswith("#"))
        created = api(api_key,"POST","/credentials", {"name":"Labruna Web Header Auth", "type":"httpHeaderAuth",
            "data":{"name":"X-Workflow-Key","value":env["N8N_WEBHOOK_SECRET"]}})
        manifest["credential"] = {"id":created["id"],"name":created["name"]}
        manifest_path.write_text(json.dumps(manifest,indent=2),encoding="utf-8")
    manifest.setdefault("workflows",{})
    for module,source in sources.items():
        workflow = build(module,source,manifest["credential"])
        (PRIVATE/(module+"-web-pilot.json")).write_text(json.dumps(workflow,ensure_ascii=False,indent=2),encoding="utf-8")
        if module not in manifest["workflows"]:
            created = api(api_key,"POST","/workflows",workflow)
            manifest["workflows"][module] = {"id":created["id"],"name":created["name"],"active":created["active"]}
            manifest_path.write_text(json.dumps(manifest,indent=2),encoding="utf-8")
        else:
            workflow_id = manifest["workflows"][module]["id"]
            current_pilot = api(api_key,"GET","/workflows/"+workflow_id)
            if any(n["name"] == "Guardar documento revisado en Sheets" for n in current_pilot["nodes"]):
                raise SystemExit("Este workflow ya guarda documentos. No reemplazarlo por el piloto; usar enable-n8n-web-writes.py.")
            if current_pilot["active"]:
                api(api_key,"POST","/workflows/"+workflow_id+"/deactivate")
            api(api_key,"PUT","/workflows/"+workflow_id,workflow)
            if current_pilot["active"]:
                api(api_key,"POST","/workflows/"+workflow_id+"/activate")
        state = api(api_key,"GET","/workflows/"+manifest["workflows"][module]["id"])
        manifest["workflows"][module]["active"] = state["active"]
        manifest_path.write_text(json.dumps(manifest,indent=2),encoding="utf-8")
        current = api(api_key,"GET","/workflows/"+source["id"])
        for field in ["nodes","connections","active"]:
            assert current[field] == source[field], "Original workflow changed: " + module
    print(json.dumps({"workflows":manifest["workflows"],"originalsUnchanged":True,"writesEnabled":False}))


if __name__ == "__main__":
    main()
