# Login con Google y permisos en el Sheet existente

Google autentica la cuenta; la web verifica el ID token (firma de Google, issuer,
audience, expiración, correo verificado y nonce). n8n consulta el Sheet y devuelve
el perfil y permisos. No se guardan contraseñas ni tokens de Google en Sheets.
El flujo usa authorization code, PKCE S256, state y una cookie temporal firmada
HttpOnly de 10 minutos. La sesión dura SESSION_TTL_HOURS (8 por defecto).

## 1. Google Cloud

Usar el cliente **Labruna Web Login**, tipo Web application, del proyecto existente.
La audiencia es External y está In production. El nombre de consentimiento sigue
siendo `n8n_Automatizations`, compartido con las otras integraciones del proyecto.

- Origen: `https://labruna.aeye.com.ar`
- Redirect URI: `https://labruna.aeye.com.ar/api/auth/google/callback`
- Scopes solicitados por la web: `openid email profile` exclusivamente.
- Para desarrollo, agregar `http://localhost:3000/api/auth/google/callback` como
  otro redirect URI si se desea probar OAuth localmente.

No cambiar la credencial OAuth de Sheets de n8n. Su callback continúa siendo
`https://n8n.aeye.com.ar/rest/oauth2-credential/callback`.

## 2. Planilla Auth_Modos / Sheet1

Documento: `1NG_HRLRdUghWa3rEJ6o7bIBN3blpA210RyEmoEAqEQk`.
Conservar A:G y agregar al final estos encabezados:

| H | I | J |
|---|---|---|
| email | web_profile | web_enabled |

Agregar dos filas usando el CSV de ejemplo `config/web-users.example.csv` como
guía. Completar cada correo real antes de habilitar su acceso. No importar el CSV
reemplazando la hoja: pegar únicamente las dos filas debajo de las existentes.

- `name`: Labruna / devAdmin.
- `number` y `mode`: vacíos para las cuentas exclusivamente web. No inventar teléfonos.
- `auth_remitos`, `auth_chapas`, `auth_contactos`, `auth_cheques`: `si` para ambas filas.
- `email`: una cuenta de Google real por fila (empresa y desarrolladores).
- `web_profile`: exactamente `Labruna` o `devAdmin`.
- `web_enabled`: `si` para habilitar; `no` para retirar acceso web.

Un correo vacío no da acceso. Los correos se comparan sin mayúsculas ni espacios
externos. Los correos duplicados producen error de configuración. Los permisos
aceptan `si` o `sí`; otros valores no habilitan el módulo. El perfil no concede
permisos automáticamente: los determinan las columnas auth_*. Contactos no es
un módulo de la web actual.

Para agregar usuarios en el futuro basta agregar filas con distintos correos y
uno de los dos perfiles. La cuenta compartida de Labruna identifica al equipo,
no a cada empleado. Quien ingrese debe poder autenticarse con esa cuenta en Google.

Los nodos actuales de WhatsApp actualizan number/mode por teléfono; el workflow
web solo lee. La herramienta de lectura sin filtro del agente de Auth_Mode podrá
ver las nuevas filas si se conecta esa rama en el futuro: verificar su manejo de
filas sin teléfono antes de usarla. Probar el enrutamiento habitual de WhatsApp
después de agregar filas y conservar una copia de la planilla antes de editarla.

## 3. Importar el workflow en n8n

Importar `docs/n8n-workflows/google-authorization.json` desde el editor de n8n.
El archivo no activa el workflow ni modifica la planilla.

1. En **Webhook autorización**, seleccionar la credencial existente
   **Labruna Web Header Auth**. Debe validar el encabezado `X-Workflow-Key` con
   el mismo secreto configurado en Docker como N8N_WEBHOOK_SECRET.
2. En **Leer usuarios**, seleccionar **AEye** de Google Sheets y comprobar que
   apunta a Auth_Modos / Sheet1. Si la selección de hoja requiere refrescarse,
   seleccionar la pestaña con gid=0 en el editor.
3. Guardar y activar/publicar según la versión de n8n.
4. Usar la URL de producción, no webhook-test:
   `https://n8n.aeye.com.ar/webhook/web/auth/authorize/v1`.

El workflow exige header auth, lee las filas y comprueba coincidencia explícita
de correo, estado y perfil sin usar IA. No confunde una salida vacía de Sheets
con una cuenta autorizada. Devuelve authorized:false para cuentas no habilitadas
y HTTP 503 para fallos de Sheets o configuración ambigua.

## 4. Variables del servidor / Docker

Completar en el `.env` privado del despliegue:

```dotenv
APP_ORIGIN=https://labruna.aeye.com.ar
NEXT_PUBLIC_BASE_PATH=
AUTH_PROVIDER=google
GOOGLE_CLIENT_ID=CLIENT_ID_DEL_NUEVO_CLIENTE
GOOGLE_CLIENT_SECRET=SECRETO_DEL_NUEVO_CLIENTE
N8N_AUTH_AUTHORIZE_URL=https://n8n.aeye.com.ar/webhook/web/auth/authorize/v1
N8N_WEBHOOK_SECRET=SECRETO_EXISTENTE_DEL_HEADER_AUTH
SESSION_SECRET=SECRETO_ALEATORIO_DE_AL_MENOS_32_CARACTERES
SESSION_TTL_HOURS=8
DEV_AUTH_BYPASS=false
FEATURE_REMITOS=true
FEATURE_CHAPAS=true
FEATURE_CHEQUES=true
```

No subir secretos al repositorio ni compartir el JSON descargado del cliente
OAuth. Docker carga estas variables mediante env_file. No hace falta montar un
archivo users.json para Google. Para el modo local legado, establecer
AUTH_PROVIDER=local y USERS_FILE con un archivo válido; montar dicho archivo
mediante un override privado de Compose si se utiliza Docker.

La consulta de permisos tiene caché de 60 segundos en cada proceso del servidor.
Cada login nuevo consulta datos frescos. Una baja o cambio de permisos se aplica
a solicitudes protegidas en hasta aproximadamente 60 segundos. No se reutiliza
una autorización vencida si falla n8n. N8N_MOCK_MODE simula documentos pero nunca
usuarios Google. Desactivar DEV_AUTH_BYPASS también en .env.development.local si
se prueba el login real; esa variable evita el login solo en desarrollo.

Después de configurar, reconstruir/recrear el contenedor con
`docker compose up -d --build`. Mantener el acceso externo por HTTPS.

## 5. Comprobación de aceptación

- Ambas cuentas configuradas entran, ven su nombre y pueden abrir los tres módulos.
- Otro correo de Google recibe “Tu cuenta no tiene acceso”.
- Un correo duplicado o una respuesta de n8n con otro correo no habilita acceso.
- Cambiar web_enabled a no invalida la autorización después de la caché.
- Cambiar auth_cheques a no impide acceder a su API, no solo oculta el módulo.
- Cancelar Google vuelve al login; cerrar sesión elimina la sesión de la web.
- Comprobar el retorno desde Android/iPhone y computadora.
- Los workflows de documentos continúan con su comportamiento piloto: habilitar
  permisos no activa los nodos de escritura de Sheets/Drive.

La implementación local no importa ni publica automáticamente workflows remotos
ni edita Google Sheets. Esos pasos requieren la sesión del administrador.
