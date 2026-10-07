"""Deploy reviewed Sheet confirmation writes, backing up the live workflows first.

No changes to WhatsApp, authorization, dropdowns, environment or document analysis.
Sheets batchUpdate commits document rows and the request receipt atomically.
"""
import copy
import datetime
import importlib.util
import json
import pathlib
import sqlite3
import urllib.parse

spec = importlib.util.spec_from_file_location("pilot", pathlib.Path(__file__).with_name("prepare-n8n-web-pilot.py"))
pilot = importlib.util.module_from_spec(spec)
spec.loader.exec_module(pilot)
IDS = {"remitos": "Oup1VtWFzpJnHw5A", "chapas": "2lBtjCL5Ozpjassu", "cheques": "ScnFEKv3i1MwOM4S"}
planner = pathlib.Path(__file__).with_name("n8n-sheet-writes.js").read_text(encoding="utf-8").replace("export ", "")


def build(source, module, target=None):
    workflow = copy.deepcopy(source)
    nodes = workflow["nodes"]
    query = next(n for n in nodes if n["name"] == "Consultar documento existente")
    doc = query["parameters"]["documentId"]["value"].split("/d/")[1].split("/")[0]
    title = query["parameters"]["sheetName"]["cachedResultName"]
    sheet_id = 0
    if target:
        doc, title, sheet_id = target
    credentials = query["credentials"]
    connections = workflow["connections"]
    remove = {"Vista previa sin guardar", "Responder guardado pendiente", "Leer encabezados y filas para guardar", "Leer recibos de confirmación", "Preparar escritura de Sheets", "Hay escritura pendiente", "Guardar documento revisado en Sheets", "Resultado del guardado", "Responder guardado", "Responder error de guardado"}
    workflow["nodes"] = nodes = [n for n in nodes if n["name"] not in remove]
    for name in remove:
        connections.pop(name, None)
    for conn in connections.values():
        for branches in conn.values():
            for branch in branches:
                branch[:] = [edge for edge in branch if edge["node"] not in remove]
    def add(name, typ, params, version, x, y=600):
        node = pilot.new_node(name, typ, params, version, x, y)
        nodes.append(node)
        return node
    def link(left, right, output=0):
        branches = connections.setdefault(left, {"main": []})["main"]
        while len(branches) <= output:
            branches.append([])
        branches[output].append({"node": right, "type": "main", "index": 0})
    confirm = next(n for n in nodes if n["name"] == "Validar confirmación web")
    confirm["parameters"]["jsCode"] = planner + '\nreturn [{json: validateConfirmation($input.first().json.body ?? {}, ' + json.dumps(module) + '), binary:$input.first().binary}];'
    connections[confirm["name"]] = {"main": []}
    base = "https://sheets.googleapis.com/v4/spreadsheets/" + doc
    common = {"authentication": "predefinedCredentialType", "nodeCredentialType": "googleSheetsOAuth2Api", "options": {"timeout": 30000}}
    read = add("Leer encabezados y filas para guardar", "n8n-nodes-base.httpRequest", {**common, "url": base + "/values/" + urllib.parse.quote("'" + title.replace("'", "''") + "'!A:T", safe="")}, 4.2, 480)
    read["credentials"] = credentials
    receipts = add("Leer recibos de confirmación", "n8n-nodes-base.httpRequest", {**common, "url": base + "?fields=developerMetadata"}, 4.2, 720)
    receipts["credentials"] = credentials
    plan = add("Preparar escritura de Sheets", "n8n-nodes-base.code", {"jsCode": planner + "\nreturn [{json:planSheetWrite($('Validar confirmación web').first().json, $('Leer encabezados y filas para guardar').first().json, $input.first().json, " + str(sheet_id) + ")}];"}, 2, 960)
    gate = add("Hay escritura pendiente", "n8n-nodes-base.if", {"conditions": {"options": {"caseSensitive": True, "typeValidation": "strict", "version": 2}, "conditions": [{"id": "pending", "leftValue": "={{ $json.requests.length }}", "rightValue": 0, "operator": {"type": "number", "operation": "gt"}}], "combinator": "and"}, "options": {}}, 2.2, 1200)
    write = add("Guardar documento revisado en Sheets", "n8n-nodes-base.httpRequest", {**common, "method": "POST", "url": base + ":batchUpdate", "sendBody": True, "specifyBody": "json", "jsonBody": "={{ {requests:$json.requests} }}"}, 4.2, 1440)
    write["credentials"] = credentials
    add("Resultado del guardado", "n8n-nodes-base.code", {"jsCode": "return [{json:$('Preparar escritura de Sheets').first().json.result}];"}, 2, 1680)
    add("Responder guardado", "n8n-nodes-base.respondToWebhook", {"respondWith": "json", "responseBody": "={{ $json }}", "options": {"responseCode": 200}}, 1.4, 1920)
    add("Responder error de guardado", "n8n-nodes-base.respondToWebhook", {"respondWith": "json", "responseBody": "={{ {message:'No se pudo guardar el documento en Sheets. Revisar la ejecución antes de reintentar.'} }}", "options": {"responseCode": 502}}, 1.4, 1200, 850)
    link(confirm["name"], read["name"])
    link(read["name"], receipts["name"])
    link(receipts["name"], plan["name"])
    link(plan["name"], gate["name"])
    link(gate["name"], write["name"])
    link(gate["name"], "Resultado del guardado", 1)
    link(write["name"], "Resultado del guardado")
    link("Resultado del guardado", "Responder guardado")
    for node in [confirm, read, receipts, plan, write]:
        node["onError"] = "continueErrorOutput"
        link(node["name"], "Responder entrada inválida" if node is confirm else "Responder error de guardado", 1)
    for node in nodes:
        if node["name"] == "Resultado de análisis":
            node["parameters"]["jsCode"] = node["parameters"]["jsCode"].replace("Piloto: la confirmación todavía no escribe en Sheets ni Drive.", "Revisá los datos: confirmar guarda en Google Sheets.")
        if node["name"] == "Estado del piloto":
            node["parameters"]["content"] = "## Labruna Web — guardado habilitado\nEl análisis solo lee. Confirmar guarda exclusivamente los datos revisados en Sheets.\nEscritura y recibo de requestId atómicos: reintentos no duplican.\nRemitos: append por artículo. Chapas/cheques: append o update por clave.\nNodos antiguos inferiores: referencia deshabilitada; no activar. Drive no se modifica."
        if node.get("disabled") and node["type"] == "n8n-nodes-base.googleSheets":
            headers = json.loads((pilot.PRIVATE / (module + "-live-values.json")).read_text(encoding="utf-8"))["values"][0]
            keys = ["column_P" if module == "chapas" and i == 15 else header for i, header in enumerate(headers)]
            node["parameters"]["columns"] = {"mappingMode": "defineBelow", "value": {column: "={{ $json[" + json.dumps(column, ensure_ascii=False) + "] }}" for column in keys}, "matchingColumns": [] if module == "remitos" else ["N° POLO" if module == "chapas" else "Nº DE CHEQUE"], "schema": [{"id": column, "displayName": column, "required": False, "display": True, "type": "string", "canBeUsedToMatch": True, "removed": False} for column in keys], "attemptToConvertTypes": False, "convertFieldsToString": False}
            node["notes"] = "Mapping corregido como referencia. La rama activa usa la API de Sheets por posición para conservar encabezados duplicados y recibos atómicos. No activar este nodo."
    return {k: workflow[k] for k in ["name", "nodes", "connections", "settings"]}


def main():
    db = sqlite3.connect(pilot.DATABASE, uri=True)
    key = db.execute("select apiKey from user_api_keys limit 1").fetchone()[0]
    backup = pathlib.Path("C:/ProgramData/Labruna/backups") / ("sheet-writes-" + datetime.datetime.now().strftime("%Y%m%d-%H%M%S"))
    backup.mkdir(parents=True)
    originals = {wid: pilot.api(key, "GET", "/workflows/" + wid) for wid in ["T9q6JTCcKHF3LeSI", "LhRHpiBVd7pFTWXw", "bqKvF6oJufAtqDQ8"]}
    for module, wid in IDS.items():
        source = pilot.api(key, "GET", "/workflows/" + wid)
        (backup / (module + ".json")).write_text(json.dumps(source, ensure_ascii=False, indent=2), encoding="utf-8")
        updated = build(source, module)
        (pilot.PRIVATE / (module + "-web-writes.json")).write_text(json.dumps(updated, ensure_ascii=False, indent=2), encoding="utf-8")
        try:
            if source["active"]:
                pilot.api(key, "POST", "/workflows/" + wid + "/deactivate")
            pilot.api(key, "PUT", "/workflows/" + wid, updated)
            if source["active"]:
                pilot.api(key, "POST", "/workflows/" + wid + "/activate")
        except Exception:
            pilot.api(key, "PUT", "/workflows/" + wid, {k: source[k] for k in ["name", "nodes", "connections", "settings"]})
            if source["active"]:
                pilot.api(key, "POST", "/workflows/" + wid + "/activate")
            raise
        state = pilot.api(key, "GET", "/workflows/" + wid)
        assert state["nodes"] == updated["nodes"] and state["active"] == source["active"]
        print(json.dumps({"module": module, "active": state["active"], "writesEnabled": True}))
    for wid, before in originals.items():
        after = pilot.api(key, "GET", "/workflows/" + wid)
        assert all(after[k] == before[k] for k in ["nodes", "connections", "active"])
    print(json.dumps({"backup": str(backup), "whatsappUnchanged": True}))


if __name__ == "__main__":
    main()
