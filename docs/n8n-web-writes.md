# Guardado de documentos de la web

Los tres workflows `Labruna Web PILOTO` conservan su nombre, ID y webhooks.
El análisis solo lee. La rama de confirmación activa guarda los datos revisados
del formulario, responde HTTP 200 y devuelve `writesEnabled: true`, `recordKey`
y `operation: created|updated`, como requiere `lib/n8n.ts`.

- Remitos/facturas: conserva el append del workflow original, una fila por artículo.
- Chapas: append o update por `N° POLO`.
- Cheques: append o update por `Nº DE CHEQUE`, conservando los ceros iniciales.
- Todas las columnas del formulario se escriben en su orden real. La segunda
  `Fecha` de chapas recibe `column_P`; no se confunde con la fecha de carga.

La rama activa usa HTTP Request con la credencial existente de Google Sheets
para llamar a `spreadsheets.batchUpdate`. Esto permite escribir por posición y
guardar un recibo en los metadatos de la misma planilla en una sola transacción.
No agrega columnas. Una repetición de `requestId` devuelve el recibo existente.
Los IDs explícitos de metadatos impiden que dos confirmaciones simultáneas de
la misma solicitud escriban ambas; si una recibe error, un reintento recupera
el recibo. Un ID nuevo de carga representa otra solicitud.

Los nodos inferiores de Sheets conservan mappings corregidos como referencia,
deshabilitados y desconectados. No activarlos: producirían una segunda escritura.
WhatsApp, login, listas desplegables y Drive no se modifican con este despliegue.
La columna `Link Imagen` conserva el valor revisado; esta rama no sube archivos a Drive.

## Herramientas del servidor

- `python scripts/inspect-n8n-web-sheets.py`: verifica encabezados mediante la
  credencial de n8n; guarda valores solamente en la carpeta privada del servidor.
- `node --test scripts/test-n8n-sheet-writes.mjs`: pruebas locales del planner.
- `python scripts/test-n8n-sheet-writes-integration.py`: prueba escritura real,
  actualización y reintentos en pestañas temporales; elimina pestañas y recibos.
  Nunca escribe registros de prueba en las pestañas de negocio.
- `python scripts/enable-n8n-web-writes.py`: respalda workflows en
  `C:/ProgramData/Labruna/backups/sheet-writes-*`, actualiza los tres de la web y
  restaura cada workflow si falla su actualización. Respeta su estado de activación.

Estas herramientas son operativas y requieren n8n, su SQLite y configuración
privada de esta máquina. No ejecutan builds ni recrean Docker. No volver a usar
`prepare-n8n-web-pilot.py` para reemplazar estos workflows por versiones sin guardado.

Verificaciones realizadas el 2026-10-06: nueve pruebas locales, creación en los
tres módulos, todas sus columnas, doble fecha, importe numérico y ceros iniciales,
actualización de chapas/cheques, reintentos secuenciales y simultáneos sin duplicados.
Las pestañas y metadatos temporales se eliminaron. Falta la prueba de un documento
real desde el navegador por parte del usuario.
