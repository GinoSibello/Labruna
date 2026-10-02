# Estado de las copias web de n8n

2026-10-01. Copias creadas por API, originales respaldados en C:\ProgramData\Labruna\n8n-web-pilot. Credencial Header Auth creada sin guardar el secreto en el código.

- [Labruna Web PILOTO - Remitos](https://n8n.aeye.com.ar/workflow/Oup1VtWFzpJnHw5A)
- [Labruna Web PILOTO - Chapas](https://n8n.aeye.com.ar/workflow/2lBtjCL5Ozpjassu)
- [Labruna Web PILOTO - Cheques](https://n8n.aeye.com.ar/workflow/ScnFEKv3i1MwOM4S)

Las copias están INACTIVAS después de las pruebas temporales. Los originales siguen activos y se verificó que sus nodos, conexiones y estado no cambiaron.

Implementado: dos webhooks por copia, Header Auth, archivo multipart normalizado, Gemini imagen/PDF con los prompts actuales, normalización, consulta de existencia en la hoja actual, respuesta JSON y manejo de errores. Confirmación devuelve HTTP 409 con vista previa y mensaje de que no se guardó nada. Los nodos originales de persistencia quedan visibles, desconectados y deshabilitados para la revisión.

Pruebas ejecutadas con copias temporalmente activas: los tres endpoints rechazan credencial incorrecta (403), entrada inválida devuelve JSON 422, confirmación devuelve vista previa 409 sin escribir. Revisión del grafo: ninguna ruta ejecutable llama a Twilio, Drive o escrituras de Sheets. Originales sin cambios. No se ejecutó Gemini con documentos ni se probó persistencia.

Pendiente para integrar en producción: adaptar y probar persistencia de confirmación e idempotencia; verificar encabezados reales; cubrir facturas/precios y múltiples desarrollos de chapas si se requiere equivalencia completa; probar documentos representativos y reintentos. La copia remitos rechaza facturas explícitamente, la de chapas rechaza desarrollo estructurado que el formulario no puede conservar.

Estas copias son un piloto de análisis y revisión, no una integración completa ni un reemplazo aprobado de Twilio. No activar para guardado real ni retirar los originales hasta completar lo pendiente.

Generador reproducible: scripts/prepare-n8n-web-pilot.py. La ejecución inicial crea copias inactivas; las posteriores actualizan únicamente las copias identificadas en el manifiesto privado, preservando su estado activo/inactivo. No imprime claves ni exporta datos descifrados de credenciales.

## Prueba del piloto de remitos desde la URL pública

2026-10-01: Remitos quedó ACTIVO en la carpeta LABRUNA para el envío de prueba del usuario; Chapas y Cheques siguen INACTIVOS. Los originales continúan activos, con nodos y conexiones sin cambios.

- Login público con cuenta test: 200.
- Archivo PNG sintético -> API web -> webhook n8n -> Gemini -> consulta Sheets -> revisión: 200 en 30,24 segundos. Número 987654, proveedor y cliente sintéticos, una línea con 12 unidades y 864 kg. No se escribió en Sheets ni Drive.
- Sin sesión: 401; archivo faltante: 422; origen ajeno: 403.
- Confirmación desde la API web: 422 PROCESSOR_ERROR, ya que el webhook piloto responde 409 con vista previa y sin guardar. Es el comportamiento actual; el botón de confirmar NO permite guardar todavía.
- Ocho regresiones de normalización correctas: prefijo/ceros de remito, rechazo de facturas y clave ausente, ceros de cheque, fechas válidas e imposibles, desarrollos simples y múltiples. Script: scripts/test-n8n-normalization.py.

Prueba pendiente del usuario: cargar un remito real desde https://labruna.aeye.com.ar/workspace y comparar los campos extraídos. El piloto no escribe. No se validaron end-to-end Chapas, Cheques, PDF ni persistencia real; no afirmar que la migración o todos los testeos estén completos.

## Compatibilidad con facturas y remitos

2026-10-01: actualizado y desplegado el formulario Remitos y facturas. La revisión conserva comprobante (REMITO/FACTURA), comprobante_numero y precios/moneda por ítem. El número de factura no requiere un número de remito. La clasificación se puede corregir antes de confirmar.

Por indicación del usuario de mantener el workflow anterior, el piloto Remitos ahora reutiliza SIN CAMBIOS los parámetros de los nodos Parsear respuesta IA y Normalizar comprobante del original. Mantiene su clasificación, cálculo de mes, normalización numérica y cálculo de precios/cotización. Guardar items en Sheets conserva exactamente su mapping de Comprobante y N° de Comprobante, pero sigue desconectado y deshabilitado: el guardado real sigue pendiente.

Validación: typecheck y seis pruebas de esquema correctos; build Docker correcto; la respuesta Gemini de la ejecución 212754 ya pasa la adaptación para facturas. Prueba pública con factura sintética correcta, con tipo FACTURA, número 987656 y precio por ítem. Verificación automatizada de igualdad de parámetros y referencias de credenciales en los tres nodos originales (parseo, normalización y mapping de guardado). No se insertaron filas de prueba en Sheets.

## Revisión con las columnas reales de la planilla

2026-10-01: verificado mediante Google Sheets A1:T1 de «2026 Planilla Remitos», pestaña «Hoja 1». El formulario de remitos y facturas muestra exclusivamente estas 20 columnas, en su orden original: Fecha, Cliente, Proveedor, Material, Comprobante, N° de Comprobante, Unid, Kg, Mts, Lts, Precio Unitario, Mes, NOTAS, EMPRESA, OBRA, COMPROBANTE RELAC., POLO, IRIS SI - NO, MATERIAL_STOCK, AÑO. Cada artículo corresponde a una fila revisable.

Fecha (dd/MM/yy), Mes y AÑO se calculan desde el instante de carga guardado en el servidor, usando America/Buenos_Aires; permanecen asociados a esa carga aunque se confirme otro día. El servidor vuelve a establecer esos valores al confirmar. Los campos sin extracción quedan vacíos para revisión; los campos ajenos a la planilla se eliminan de la revisión y del payload de confirmación.

Validación: typecheck, nueve pruebas de esquema/adaptación y build Docker correctos. Publicada imagen labruna-documentos:sheet-review-20261001, contenedor saludable. Factura sintética por URL pública: análisis 200, exactamente 20 columnas, Fecha 01/10/26, Mes octubre, AÑO 2026. Ejecución piloto 212778 confirmó la conservación de NOTAS editadas y restauración de la fecha automática ante un valor alterado. Sigue respondiendo 409 sin escribir (la web lo presenta como 422 PROCESSOR_ERROR); persistencia real aún pendiente. Los workflows originales siguen sin cambios.

## Formularios de Cheques y Chapas y listas sincronizadas

2026-10-01: Cheques usa exclusivamente los 16 encabezados reales de «2026 Planilla de Cheques» (1w5CqAvC4XW3m6K-_GOFodyl_FPnUccMqXS-P8k2vL3k), «Hoja 1», A1:P1. No usar la planilla antigua marcada NO USAR MAS. FECHA DE ING. y MES corresponden al momento de carga en Buenos Aires. Las fechas propias del cheque permanecen revisables.

Chapas usa los 20 encabezados de «Pedidos plegados» (1YPsi8KY7i_yD339FPEqErnCetSeEIoICx7E5h_WAdq8), «Pedidos Plegados 2025», A1:T1. Ambas columnas Fecha se conservan: A es automática por carga y P permanece editable, con clave interna column_P para evitar colisión. No se detectó ninguna validación desplegable en A2:T1068; no se inventaron listas. Las columnas de cálculos sin datos extraídos permanecen vacías para revisión.

Las validaciones reales ONE_OF_LIST de Cheques se leen en vivo: CLIENTE / INGRESADO POR: (25 opciones únicas, unión de variantes entre filas), ESTADO DEL CHEQUE (9), EMPRESA (5). Nuevo workflow «Labruna Web - Listas de Google Sheets» F8cjlQpi4flwRQ6F, activo en carpeta LABRUNA, con Header Auth y la referencia OAuth preexistente de Sheets. Agregar opción extiende solamente las validaciones existentes de la columna pedida, preserva variantes y reglas, y verifica mediante relectura. No escribe valores, fórmulas ni filas de documentos. La API web exige sesión, permiso del módulo, mismo origen para mutaciones y valida la columna; las altas se serializan y no duplican opciones. Confirmar valida que las selecciones pertenezcan a la lista vigente.

Despliegue final: imagen labruna-documentos:sheet-forms-final-20261001. API pública de listas verificada tras el reemplazo del contenedor; cinco empresas reales, sin la opción sintética. Capturas de revisión: docs/cheques-review-20261001.png y docs/chapas-review-20261001.png.

Validación: typecheck, 13 pruebas de módulos/adaptaciones/planificador y build Docker correctos. Análisis público de cheque y chapa sintéticos: 200, 16 y 20 columnas respectivamente. Ejecuciones 212794/212795 confirmaron datos editados y fechas automáticas restauradas; mantienen respuesta de guardado pendiente, sin escribir documentos. API de listas pública: 200; sin sesión 401; columna no desplegable 422. Alta real de opción sintética EMPRESA mediante API web: 200, verificada en Sheets; eliminada mediante edición exclusivamente de validación y relectura idéntica al estado previo. La prueba visual confirmó los tres selectores y el control Agregar opción. Chapas y Cheques pilotos ahora están activos para análisis/revisión; originales sin cambios. No se añadieron reintentos de Gemini.
