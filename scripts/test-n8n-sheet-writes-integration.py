"""Exercise real n8n/Sheets writes in temporary tabs, removing all test data.

Business tabs and production workflows are read only throughout this test.
"""
import importlib.util
import json
import pathlib
import sqlite3
import urllib.parse
import urllib.request
import uuid
from concurrent.futures import ThreadPoolExecutor

spec = importlib.util.spec_from_file_location("writes", pathlib.Path(__file__).with_name("enable-n8n-web-writes.py"))
writes = importlib.util.module_from_spec(spec)
spec.loader.exec_module(writes)
pilot = writes.pilot


def main():
    db = sqlite3.connect(pilot.DATABASE, uri=True)
    key = db.execute("select apiKey from user_api_keys limit 1").fetchone()[0]
    env = dict(line.split("=", 1) for line in pathlib.Path("C:/ProgramData/Labruna/.env").read_text().splitlines() if "=" in line and not line.startswith("#"))
    for module, wid in writes.IDS.items():
        source = pilot.api(key, "GET", "/workflows/" + wid)
        query = next(n for n in source["nodes"] if n["name"] == "Consultar documento existente")
        doc = query["parameters"]["documentId"]["value"].split("/d/")[1].split("/")[0]
        base = "https://sheets.googleapis.com/v4/spreadsheets/" + doc
        hook = pilot.new_node("Admin test", "n8n-nodes-base.webhook", {"httpMethod": "POST", "path": "private-sheet-test-" + str(uuid.uuid4()), "authentication": "headerAuth", "responseMode": "responseNode", "options": {}}, 2)
        hook["webhookId"] = str(uuid.uuid4())
        hook["credentials"] = next(n["credentials"] for n in source["nodes"] if n["name"] == "Webhook confirm")
        http = pilot.new_node("Sheets test", "n8n-nodes-base.httpRequest", {"method": "={{ $json.body.method }}", "url": "={{ $json.body.url }}", "authentication": "predefinedCredentialType", "nodeCredentialType": "googleSheetsOAuth2Api", "sendBody": "={{ $json.body.method === 'POST' }}", "specifyBody": "json", "jsonBody": "={{ $json.body.payload ?? {} }}", "options": {"timeout": 30000}}, 4.2)
        http["credentials"] = query["credentials"]
        result = pilot.new_node("Return test", "n8n-nodes-base.respondToWebhook", {"respondWith": "json", "responseBody": "={{ $json }}", "options": {}}, 1.4)
        admin = pilot.api(key, "POST", "/workflows", {"name": "TEMP Labruna isolated write test", "nodes": [hook, http, result], "connections": {"Admin test": {"main": [[{"node": "Sheets test", "type": "main", "index": 0}]]}, "Sheets test": {"main": [[{"node": "Return test", "type": "main", "index": 0}]]}}, "settings": {"saveDataSuccessExecution": "none", "saveDataErrorExecution": "all"}})
        temporary = None
        sheet_id = None
        def post(path, body):
            req = urllib.request.Request("http://127.0.0.1:5678/webhook/" + path, data=json.dumps(body).encode(), headers={"X-Workflow-Key": env["N8N_WEBHOOK_SECRET"], "Content-Type": "application/json"})
            with urllib.request.urlopen(req, timeout=60) as res:
                return json.load(res)
        def sheets(method, url, payload=None):
            return post(hook["parameters"]["path"], {"method": method, "url": url, "payload": payload or {}})
        try:
            pilot.api(key, "POST", "/workflows/" + admin["id"] + "/activate")
            title = "TEMP_WEB_TEST_" + str(uuid.uuid4())[:8]
            response = sheets("POST", base + ":batchUpdate", {"requests": [{"addSheet": {"properties": {"title": title}}}]})
            sheet_id = response["replies"][0]["addSheet"]["properties"]["sheetId"]
            headers = json.loads((pilot.PRIVATE / (module + "-live-values.json")).read_text(encoding="utf-8"))["values"][0]
            sheets("POST", base + ":batchUpdate", {"requests": [{"appendCells": {"sheetId": sheet_id, "rows": [{"values": [{"userEnteredValue": {"stringValue": h}} for h in headers]}], "fields": "userEnteredValue"}}]})
            workflow = writes.build(source, module, (doc, title, sheet_id))
            workflow["name"] = "TEMP Labruna confirmation integration " + module
            workflow["settings"]["saveDataSuccessExecution"] = "none"
            for node in workflow["nodes"]:
                if node["type"] == "n8n-nodes-base.webhook":
                    node["parameters"]["path"] = "private-confirm-test-" + str(uuid.uuid4())
                    node["webhookId"] = str(uuid.uuid4())
            temporary = pilot.api(key, "POST", "/workflows", workflow)
            pilot.api(key, "POST", "/workflows/" + temporary["id"] + "/activate")
            path = next(n["parameters"]["path"] for n in workflow["nodes"] if n["name"] == "Webhook confirm")
            row = {("column_P" if module == "chapas" and i == 15 else h): "isolated-reviewed-" + str(i) for i, h in enumerate(headers)}
            if module == "remitos":
                row.update({"Comprobante": "FACTURA", "N° de Comprobante": "012345", "Material": "ISOLATED TEST ONLY"})
            elif module == "chapas":
                row.update({"N° POLO": "ISOLATED-TEST", "Fecha": "06/10/26", "column_P": "07/10/26"})
            else:
                row.update({"Nº DE CHEQUE": "00123456", "MONTO EN PESOS": "123.45"})
            rows = [row, {**row, "Material": "SECOND ISOLATED ITEM"}] if module == "remitos" else [row]
            body = {"source": "web", "module": module, "userId": "isolated-integration-test", "requestId": str(uuid.uuid4()), "data": json.dumps({"rows": rows} if module == "remitos" else row)}
            created = post(path, body)
            assert created["operation"] == "created" and created["writesEnabled"] is True, created
            replay = post(path, body)
            assert replay["operation"] == "created", replay
            values_url = base + "/values/" + urllib.parse.quote("'" + title + "'!A:T", safe="") + "?valueRenderOption=UNFORMATTED_VALUE"
            saved = sheets("GET", values_url)["values"]
            assert len(saved) == len(rows) + 1, "Retry duplicated rows"
            for i, wanted in enumerate(rows):
                expected = [wanted["column_P" if module == "chapas" and j == 15 else h] for j, h in enumerate(headers)]
                if module == "cheques":
                    expected[headers.index("MONTO EN PESOS")] = float(wanted["MONTO EN PESOS"])
                assert saved[i + 1] == expected, (module, "Incorrect reviewed-column mapping")
            if module != "remitos":
                field = "Proyecto" if module == "chapas" else "NOTAS"
                row[field] = "EDITED IN ISOLATED TEST"
                body.update({"requestId": str(uuid.uuid4()), "data": json.dumps(row)})
                updated = post(path, body)
                assert updated["operation"] == "updated", updated
                saved = sheets("GET", values_url)["values"]
                assert len(saved) == 2 and saved[1][headers.index(field)] == row[field]
            body["requestId"] = str(uuid.uuid4())
            with ThreadPoolExecutor(max_workers=2) as pool:
                def confirm_concurrently(_):
                    try:
                        return post(path, body)
                    except urllib.error.HTTPError as error:
                        assert error.code == 502
                        return {"atomicConcurrentWriteRejected": True}
                simultaneous = list(pool.map(confirm_concurrently, range(2)))
            assert any(item.get("operation") in ["created", "updated"] for item in simultaneous)
            assert post(path, body)["operation"] in ["created", "updated"]
            after_concurrent = sheets("GET", values_url)["values"]
            assert len(after_concurrent) == (2 * len(rows) + 1 if module == "remitos" else 2), "Concurrent retry duplicated rows"
            print(json.dumps({"module": module, "create": True, "replayNoDuplicate": True, "concurrentReplayNoDuplicate": True, "allColumnsVerified": True, "update": module != "remitos"}))
        finally:
            if temporary:
                pilot.api(key, "POST", "/workflows/" + temporary["id"] + "/deactivate")
                pilot.api(key, "DELETE", "/workflows/" + temporary["id"])
            if sheet_id is not None:
                cleaned = sheets("POST", base + ":batchUpdate", {"requests": [{"deleteDeveloperMetadata": {"dataFilter": {"developerMetadataLookup": {"metadataKey": f"labruna_web_{module}_{sheet_id}"}}}}, {"deleteSheet": {"sheetId": sheet_id}}]})
                assert "replies" in cleaned, "Temporary Sheet cleanup failed"
            pilot.api(key, "POST", "/workflows/" + admin["id"] + "/deactivate")
            pilot.api(key, "DELETE", "/workflows/" + admin["id"])
            print(json.dumps({"module": module, "temporaryDataRemoved": True}))


if __name__ == "__main__":
    main()
