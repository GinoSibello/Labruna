"""Execute the actual n8n parsing code against synthetic regression cases."""
import importlib.util
import json
import pathlib
import subprocess

spec = importlib.util.spec_from_file_location(
    "pilot", pathlib.Path(__file__).with_name("prepare-n8n-web-pilot.py")
)
pilot = importlib.util.module_from_spec(spec)
spec.loader.exec_module(pilot)

cases = [
    ("cheques", "numero_cheque", {"numero_cheque":"00123456", "fecha_pago_diferido":"01/10/2026", "monto_numeros":"123.50"}, True),
    ("cheques", "numero_cheque", {"numero_cheque":"00123456", "fecha_pago_diferido":"31/02/2026", "monto_numeros":"123.50"}, False),
    ("cheques", "numero_cheque", {"numero_cheque":"123", "fecha_pago_diferido":"01/10/2026", "monto_numeros":"123.50"}, False),
    ("chapas", "N_POLO", {"N_POLO":"TEST-1", "desarrollo":"120 x 240"}, True),
    ("chapas", "N_POLO", {"N_POLO":"TEST-1", "desarrollo":{"a":100}}, False),
]

for module, key, data, expected in cases:
    js = (
        "const MODULE=" + json.dumps(module) + ",KEY=" + json.dumps(key) + ";"
        "const $input={first:()=>({json:{candidates:[{content:{parts:[{text:"
        + json.dumps(json.dumps(data)) + "}]}}]}})};"
        "try{const r=(function(){" + pilot.PARSE + "})();"
        "console.log(JSON.stringify({ok:true,data:r[0].json}));}"
        "catch(e){console.log(JSON.stringify({ok:false}));}"
    )
    result = json.loads(subprocess.check_output(["node", "-e", js], text=True))
    assert result["ok"] == expected, (module, data)
    if module == "remitos" and expected:
        assert result["data"]["comprobante_numero"] == "987654"
    if module == "cheques" and expected:
        assert result["data"]["numero_cheque"] == "00123456"
        assert result["data"]["fecha_pago_diferido"] == "2026-10-01"

original = json.loads((pilot.PRIVATE / "remitos-original.json").read_text(encoding="utf-8"))
workflow = pilot.build("remitos", original, {"id":"test", "name":"test"})
source_nodes = {node["name"]:node for node in original["nodes"]}
pilot_nodes = {node["name"]:node for node in workflow["nodes"]}
for name in ["Parsear respuesta IA", "Normalizar comprobante", "Guardar items en Sheets"]:
    assert pilot_nodes[name]["parameters"] == source_nodes[name]["parameters"]
    assert pilot_nodes[name].get("credentials") == source_nodes[name].get("credentials")
assert "FACTURA" in source_nodes["Normalizar comprobante"]["parameters"]["jsCode"]
print(json.dumps({"normalizationChecksPassed":len(cases), "originalRemitosNodesPreserved":3}))
