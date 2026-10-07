"""Read Sheet values through n8n's existing credential; keep values private."""
import importlib.util
import json
import pathlib
import sqlite3
import urllib.parse
import urllib.request
import uuid

spec = importlib.util.spec_from_file_location("pilot", pathlib.Path(__file__).with_name("prepare-n8n-web-pilot.py"))
pilot = importlib.util.module_from_spec(spec)
spec.loader.exec_module(pilot)
IDS = {"remitos": "Oup1VtWFzpJnHw5A", "chapas": "2lBtjCL5Ozpjassu", "cheques": "ScnFEKv3i1MwOM4S"}


def main():
    db = sqlite3.connect(pilot.DATABASE, uri=True)
    key = db.execute("select apiKey from user_api_keys limit 1").fetchone()[0]
    env = dict(line.split("=", 1) for line in pathlib.Path("C:/ProgramData/Labruna/.env").read_text().splitlines() if "=" in line and not line.startswith("#"))
    for module, wid in IDS.items():
        workflow = pilot.api(key, "GET", "/workflows/" + wid)
        query = next(n for n in workflow["nodes"] if n["name"] == "Consultar documento existente")
        spreadsheet = query["parameters"]["documentId"]["value"].split("/d/")[1].split("/")[0]
        title = query["parameters"]["sheetName"]["cachedResultName"]
        hook = pilot.new_node("Read", "n8n-nodes-base.webhook", {"httpMethod": "POST", "path": "private-inspect-" + str(uuid.uuid4()), "authentication": "headerAuth", "responseMode": "responseNode", "options": {}}, 2)
        hook["webhookId"] = str(uuid.uuid4())
        hook["credentials"] = next(n["credentials"] for n in workflow["nodes"] if n["name"] == "Webhook confirm")
        read = pilot.new_node("Sheets", "n8n-nodes-base.httpRequest", {"url": "https://sheets.googleapis.com/v4/spreadsheets/" + spreadsheet + "/values/" + urllib.parse.quote("'" + title + "'!A:T", safe=""), "authentication": "predefinedCredentialType", "nodeCredentialType": "googleSheetsOAuth2Api", "options": {"timeout": 20000}}, 4.2)
        read["credentials"] = query["credentials"]
        response = pilot.new_node("Result", "n8n-nodes-base.respondToWebhook", {"respondWith": "json", "responseBody": "={{ $json }}", "options": {}}, 1.4)
        temporary = pilot.api(key, "POST", "/workflows", {"name": "TEMP Labruna private Sheet inspection", "nodes": [hook, read, response], "connections": {"Read": {"main": [[{"node": "Sheets", "type": "main", "index": 0}]]}, "Sheets": {"main": [[{"node": "Result", "type": "main", "index": 0}]]}}, "settings": {"saveDataSuccessExecution": "none", "saveDataErrorExecution": "none"}})
        try:
            pilot.api(key, "POST", "/workflows/" + temporary["id"] + "/activate")
            req = urllib.request.Request("http://127.0.0.1:5678/webhook/" + hook["parameters"]["path"], data=b"{}", headers={"X-Workflow-Key": env["N8N_WEBHOOK_SECRET"], "Content-Type": "application/json"})
            with urllib.request.urlopen(req, timeout=30) as res:
                values = json.load(res)
            assert isinstance(values.get("values"), list), "Sheet read failed"
            pilot.PRIVATE.mkdir(parents=True, exist_ok=True)
            (pilot.PRIVATE / (module + "-live-values.json")).write_text(json.dumps(values, ensure_ascii=False), encoding="utf-8")
            print(json.dumps({"module": module, "headers": values["values"][0], "rows": len(values["values"]) - 1}, ensure_ascii=True))
        finally:
            pilot.api(key, "POST", "/workflows/" + temporary["id"] + "/deactivate")
            pilot.api(key, "DELETE", "/workflows/" + temporary["id"])


if __name__ == "__main__":
    main()
