# MEMORY.md — Memoria del proyecto

Última actualización: 2026-10-06. Sin secretos ni datos personales.

## Estado actual

- main se actualizó por fast-forward a c729ae6; antes del pull no había cambios locales ni divergencia.
- Despliegue real: Docker manual, contenedor labruna-documentos, puerto local 3100; configuración privada C:/ProgramData/Labruna/.env. No sustituirlo por Compose sin revisar sus diferencias.
- Google login está desplegado desde e415c09. Callback y variables verificados; prueba de acceso real por el usuario pendiente.
- El error de autorización observado era web_enable en Sheets: el workflow requiere web_enabled. No confundirlo con credenciales OAuth.
- El usuario autorizó habilitar escrituras y corregir Sheets en los tres workflows web.
- Labruna Web PILOTO conserva IDs/URLs; los tres workflows están activos y confirman con HTTP 200 y writesEnabled:true.
- Guardado usa datos revisados y todas las columnas: remitos append por artículo; chapas/cheques append o update por clave, como los originales.
- La segunda Fecha de chapas se escribe desde column_P por posición. Se corrigieron mappings con caracteres dañados y referencias antiguas a IA.
- La rama activa usa HTTP Request con la credencial existente de Sheets y batchUpdate; nodos inferiores de Sheets corregidos como referencia, deshabilitados/desconectados.
- Escritura y recibo de requestId atómicos en metadatos de Sheets, sin columnas nuevas. IDs explícitos de metadatos protegen reintentos simultáneos.
- WhatsApp, autorización, dropdowns, Drive y configuración privada no cambiaron. Link Imagen conserva el valor revisado; no hay nueva subida a Drive.
- Respaldo: C:/ProgramData/Labruna/backups/sheet-writes-20261006-124049.

## Verificación realizada

- Nueve pruebas locales del planner pasaron.
- Pruebas reales n8n/Sheets en pestañas temporales pasaron: creación, todas las columnas, importes, ceros iniciales, ambas fechas, update y reintentos secuenciales/simultáneos sin duplicados.
- Se eliminaron pestañas, recibos y workflows temporales. No se agregaron registros de prueba a las pestañas de negocio; sus cantidades de filas permanecieron iguales.
- Tres webhooks productivos rechazan entradas inválidas con HTTP 422 antes de escribir. Originales de WhatsApp comparados y sin cambios.
- Se reinició labruna-documentos por pedido del usuario el 2026-10-06: healthy, /login HTTP 200 y botón Google presente. Los cambios de n8n ya estaban activos antes del reinicio.
- Scripts/documentación quedan locales, sin commit ni push. Falta prueba de un documento real desde la web por el usuario.

## Errores a evitar

- No desplegar prepare-n8n-web-pilot.py encima de workflows con guardado; incluye protección. Usar enable-n8n-web-writes.py.
- No activar nodos inferiores de referencia: duplicarían la escritura de la rama activa.
- N8N_MOCK_MODE no simula autorización Google; ejemplos antiguos de n8n-contracts no representan el formulario actual.
- Leer AGENTS.md y documentación instalada de Next antes de cambios de código; contrastar esquemas con lib/remitos-sheet.ts y lib/sheet-forms.ts.
- No subir .env, SQLite, exportaciones privadas, respaldos ni valores de usuarios al repositorio.
- Comandos operativos: docs/n8n-web-writes.md. Herramientas requieren datos privados de esta máquina.

## Actualización 2026-10-07
- Se incorpora origin/main 3b1ac58: remitos conserva Fecha detectada y permite editarla; Mes y AÑO se derivan de ella.
- Se publica la rama codex/n8n-sheet-writes con herramientas y documentación del guardado ya habilitado.
- npm run check con el Node del PATH falla en workers de autenticación (3221225477); se verifica con runtime de Codex y Docker Node 22.
- Verificación actual: npm run check pasó con runtime de Codex (34 pruebas y build); nueve pruebas del planner y sintaxis Python correctas.
