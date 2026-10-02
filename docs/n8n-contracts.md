# Contratos de integración con n8n

Los workflows web son nuevos e independientes de `Auth_Mode`, `RemitosV2`, `ChapasV2` y `Cheques`. Los workflows de Twilio deben permanecer activos durante la convivencia.

## Seguridad y configuración común

Cada webhook nuevo debe:

1. Usar método `POST`.
2. Recibir `multipart/form-data`.
3. Validar la cabecera `X-Workflow-Key` mediante Header Auth de n8n.
4. Estar disponible solamente desde la red privada de la aplicación.
5. Responder mediante `Respond to Webhook` al finalizar, no inmediatamente.
6. Devolver JSON y un código HTTP representativo.

Campos comunes recibidos:

| Campo | Uso |
|---|---|
| `requestId` | UUID de idempotencia y correlación |
| `source` | Siempre `web` |
| `userId` | Usuario autenticado por la API |
| `module` | `remitos`, `chapas` o `cheques` |
| `fileName` | Nombre saneado del archivo |
| `mimeType` | MIME detectado a partir del contenido |
| `file` | Binario original en `binary.file` |

Los workflows de confirmación también reciben `data`, un string JSON con los valores revisados por el usuario.

## Respuesta de análisis

Los tres endpoints `/analyze/v1` deben responder:

```json
{
  "operation": "create",
  "data": {},
  "warnings": []
}
```

`operation` puede ser `create` o `update`. El análisis puede consultar Sheets para resolverlo, pero no puede escribir en Sheets ni Drive.

## Respuesta de confirmación

Los tres endpoints `/confirm/v1` deben responder:

```json
{
  "operation": "created",
  "recordKey": "18452",
  "message": "Remito guardado correctamente"
}
```

`operation` puede ser `created` o `updated`. Antes de escribir, el workflow debe volver a buscar la clave de negocio. Una repetición con el mismo `requestId` debe devolver el resultado anterior o efectuar el mismo upsert, nunca anexar un duplicado.

## Remitos

### Endpoints

- `POST /webhook/web/remitos/analyze/v1`
- `POST /webhook/web/remitos/confirm/v1`

### Análisis

1. Webhook con Header Auth.
2. Gemini analiza `binary.file` con el prompt existente de Remitos.
3. Código limpia backticks y convierte la respuesta a JSON.
4. Normalizar `remito_aux` quitando ceros iniciales.
5. Buscar `remito_aux` en la misma hoja actual.
6. Responder con `operation`, `data` y advertencias.

Esquema de `data`:

```json
{
  "proveedor": "",
  "remito": "",
  "remito_aux": "18452",
  "fecha": "2026-09-24",
  "cliente": "",
  "factura_numero": "",
  "transporte_numero": "",
  "ped_cliente_nro": "",
  "destino": "",
  "items": [
    {
      "material": "",
      "unidades": "",
      "kg": "",
      "mts": "",
      "litros": "",
      "unidad_medida": "",
      "lote": ""
    }
  ]
}
```

### Confirmación

Parsear `body.data`, exigir `remito_aux`, consultar nuevamente la hoja y ejecutar update o append con los mappings actuales.

## Chapas

### Endpoints

- `POST /webhook/web/chapas/analyze/v1`
- `POST /webhook/web/chapas/confirm/v1`

### Análisis

1. Gemini analiza el archivo sin llamar todavía a Drive.
2. Limpiar y normalizar el JSON.
3. Calcular los valores derivados con las mismas reglas actuales.
4. Exigir que Gemini devuelva `N_POLO`.
5. Consultar `Pedidos Plegados 2025` por `N° POLO`.
6. Responder sin efectos laterales.

Esquema de `data`:

```json
{
  "fecha": "2026-09-24",
  "cliente": "",
  "proyecto": "",
  "material": "",
  "color_material": "",
  "espesor_material_mm": "",
  "total_suma_interna_mm": "",
  "desarrollo": "",
  "pintura": "",
  "cantidad_total": "",
  "N_POLO": "P-2481",
  "arquitecto": ""
}
```

### Confirmación

1. Parsear `body.data` y bloquear si falta `N_POLO`.
2. Enviar `binary.file` a `http://127.0.0.1:5100/n8n_process_file`.
3. Si el procesador falla, responder error sin escribir en Sheets.
4. Subir el archivo procesado a la carpeta actual de Drive.
5. Si Drive falla, responder error sin escribir en Sheets.
6. Volver a buscar por `N° POLO` y efectuar upsert con el enlace.

La asignación debe ser explícitamente `N° POLO ← data.N_POLO`. No usar un valor fijo vacío.

## Cheques

### Endpoints

- `POST /webhook/web/cheques/analyze/v1`
- `POST /webhook/web/cheques/confirm/v1`

### Análisis

Usar el prompt actual y conservar ceros iniciales. Para PDF, pasar el documento de forma compatible con el nodo de Gemini utilizado. Buscar la hoja por `Nº DE CHEQUE` sin escribir.

Esquema de `data`:

```json
{
  "banco": "",
  "tipo_cheque": "",
  "numero_cheque": "00182746",
  "fecha_emision": "2026-09-20",
  "fecha_pago_diferido": "2026-10-30",
  "domicilio_pago": "",
  "monto_numeros": "1250000.00",
  "librador_nombre": "",
  "librador_cuit": "30712345678",
  "beneficiario": "",
  "endosos": []
}
```

### Confirmación

Exigir ocho dígitos en `numero_cheque`, fecha de pago válida y monto numérico. Volver a consultar `Nº DE CHEQUE` y aplicar los mappings actuales mediante upsert.

## Tratamiento de errores

- Entrada inválida: `422` con `{ "message": "..." }`.
- Credencial incorrecta: `401` o `403`.
- Gemini, Sheets, Drive o procesador no disponible: `502` o `503`.
- Timeout interno: `504`.

No incluir credenciales, archivos, prompts completos ni datos bancarios en logs. Usar `requestId` para correlación.
