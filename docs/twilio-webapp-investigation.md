# Migración de Labruna: Twilio a webapp

Investigación del 2026-10-01. Lectura de la base productiva de n8n en modo solo lectura y del código actual de la webapp. No se modificaron workflows ni se ejecutaron operaciones sobre Sheets, Drive o Twilio.

## Estado verificado

- Webapp: https://labruna.aeye.com.ar, contenedor labruna-documentos, puerto 3100.
- n8n nativo: puerto 5678. GET /healthz desde el contenedor vía host.docker.internal devuelve 200.
- Los seis endpoints web configurados no existen en los workflows ni en los webhooks registrados.
- Modo simulado desactivado. Las tres pantallas están habilitadas, pero esto no implica que puedan procesar documentos todavía.
- Auth_Mode (OiV4h9w6maScERko), Cheques (bqKvF6oJufAtqDQ8), ChapasV2 (LhRHpiBVd7pFTWXw) y RemitosFacturasV3.4 (T9q6JTCcKHF3LeSI) están activos según workflow_entity.
- docs/n8n-contracts.md y docs/rollout.md son una propuesta previa; su referencia a RemitosV2 no describe el nombre actual ni toda su funcionalidad.

## Arquitectura propuesta

Carga en web -> API autenticada -> webhook de análisis -> Gemini y consultas -> JSON -> revisión en web -> API de confirmación -> webhook de confirmación -> persistencia -> JSON de resultado.

La sesión y selección de módulo reemplazan Auth_Mode, WaId, From, comandos MENU y estado conversacional. El binario multipart reemplaza MediaUrl0 y su descarga autenticada en Twilio. Las respuestas JSON reemplazan las notificaciones de carga por WhatsApp. Las alertas programadas son otro proceso: reemplazar la entrada de documentos no reemplaza automáticamente Alertas_Cheques_Labruna.

Crear dos workflows por módulo, reutilizando prompts, credenciales referenciadas, cálculos y destinos actuales. No conectar la web al flujo completo de WhatsApp: hoy guarda durante el procesamiento y depende de identidad telefónica.

## Contrato común

POST /webhook/web/{remitos|chapas|cheques}/{analyze|confirm}/v1.

Header Auth de n8n: X-Workflow-Key con el secreto configurado en la API. Multipart: requestId, source=web, userId, module, fileName, mimeType, file. Confirmación agrega data como string JSON. Normalizar explícitamente el binario recibido a la propiedad esperada por los nodos existentes (data), o configurar los nodos para file; verificar el nombre real con una ejecución de prueba.

Análisis responde {operation: create|update, data: objeto, warnings: array}. Solo consultas, sin persistencia de negocio. Confirmación responde {operation: created|updated, recordKey: string, message: string}. Usar Respond to Webhook y errores JSON en todas las ramas. Verificar disponibilidad real de las URLs productivas publicadas en la versión instalada.

La cabecera autentica al backend: no confiar en un userId enviado directamente por un cliente externo. El contrato pide acceso privado, pero n8n también se publica mediante Cloudflare: comprobar reglas de ingreso para que las nuevas rutas no queden expuestas públicamente por el túnel. Header Auth no sustituye esa restricción de red.

## Cambios por módulo

### Remitos y facturas

Flujo real RemitosFacturasV3.4: Analizar comprobante IA -> Parsear respuesta IA -> Normalizar comprobante -> Preparar items -> Separar items -> Guardar items en Sheets (append).

- Reutilizar extracción y normalización; separar la escritura para confirmación.
- Conserva REMITO/FACTURA, número de comprobante, mes, moneda, precio unitario y conversiones con cotización oficial. La web actual no representa todos esos campos: moduleSchemas.remitos y el esquema de items los descartan al validar. Decidir si la primera integración cubre solo remitos o ampliar formulario, tipos y contrato para facturas antes de migrar esa función.
- Sheets contiene una fila por material. Buscar solo remito_aux no alcanza para actualizar varios ítems: definir identidad estable por comprobante/proveedor/ítem y cómo reconciliar ítems eliminados o modificados.
- El append actual no previene duplicados. Implementar registro durable de requestId, serialización o bloqueo por comprobante y recuperación de escrituras parciales. El cache local de la web no protege escrituras realizadas en n8n antes de un timeout.
- Dejar de ejecutar los nodos telefónicos y mensajes Twilio en la ruta web.

### Chapas

Flujo real ChapasV2: descarga -> Gemini y procesador en paralelo -> Drive -> Merge -> consulta por N° POLO -> escritura condicional.

- Análisis: Gemini, parseo, cálculo de desarrollo y peso por espesor, consulta de existencia. Mantener contexto y cálculos derivados sin subir a Drive.
- Confirmación: recalcular derivados sobre datos corregidos, procesar archivo en http://127.0.0.1:5100/n8n_process_file, subir resultado a la carpeta actual y guardar vínculo en Sheets.
- El mapping actual incluye N_POLO, pero algunas claves de mapping contienen texto con codificación defectuosa (por ejemplo NÂ° POLO) mientras matchingColumns usa N° POLO. Comparar encabezados reales antes de copiarlo.
- Revisar If2: existe una salida sin nodos conectados; diseñar respuesta y actualización explícitas para registros existentes.
- Evitar archivos duplicados en Drive al reintentar y contemplar recuperación si Drive se completa pero Sheets falla.

### Cheques

- Reutilizar extracción y reglas de fechas: fecha de ingreso, mes y vencimiento derivado de pago diferido + 30 días.
- El código actual espera dd/mm/yyyy; la web valida fecha_pago_diferido como yyyy-mm-dd. Convertir de forma explícita en ambos sentidos y preservar la regla existente.
- Conservar ocho dígitos del cheque y tratar la clave de Sheets como texto.
- Hay varias ramas y destinos de escritura; identificar qué hojas y rutas deben mantenerse. No reducirlas a una sola por accidente.
- Se detectan claves NÂº DE CHEQUE frente a matchingColumns N°/Nº DE CHEQUE y una expresión sin prefijo = en una rama. Verificar encabezados y corregir las copias web con datos de prueba.
- No retirar Alertas_Cheques_Labruna junto con el webhook de carga: su Schedule Trigger es independiente y puede seguir enviando alertas por WhatsApp.

## Secuencia de implementación y corte

1. Exportar respaldos de workflows y capturar encabezados/destinos reales de Sheets y Drive sin incluir secretos en el repositorio.
2. Implementar los seis workflows web y los ajustes necesarios de esquema. Comenzar por remitos; resolver cobertura de facturas antes de considerarlo equivalente al flujo actual.
3. Configurar Header Auth, restricción de rutas y almacenamiento durable de idempotencia. Limitar la concurrencia de guardados por clave.
4. Probar contra copias de recursos: imagen/PDF, documento existente, corrección manual, rechazo, timeout, reintento y fallas entre escrituras. El análisis no debe crear filas ni archivos en Drive. PDF requiere verificación aparte: el nodo existente usa recurso image.
5. Probar desde la URL pública con una cuenta real, confirmar y verificar filas, ítems y vínculos resultantes. Los timeouts web y de proxy deben cubrir la duración real; el backend configura 120 segundos.
6. Migrar la entrada de Labruna en SuperWebhook/Twilio cuando la web cubra el alcance acordado. Inspeccionar el enrutamiento exacto antes del corte: SuperWebhook sirve varios destinos y no debe apagarse completo.
7. Retirar o desactivar las rutas antiguas específicas según alcance. Conservar un rollback mediante reactivación del enrutamiento y workflows originales. Las alertas requieren decisión separada si se busca eliminar todo uso de Twilio.

## Límites de la investigación

Se verificaron definiciones locales y conectividad de n8n. No se verificaron encabezados en vivo, autorización de credenciales Google/Gemini, ejecución del procesador, reglas actuales del túnel ni resultados end-to-end. No se enviaron documentos a los workflows productivos.

## Referencias

- Código: lib/n8n.ts, lib/modules.ts, lib/types.ts, rutas app/api/process.
- Contrato previo: docs/n8n-contracts.md.
- n8n Webhook: https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.webhook/
- n8n Respond to Webhook: https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.respondtowebhook/
