<!-- BEGIN:nextjs-agent-rules -->

# Este NO es el Next.js que conocés

Esta versión incluye cambios incompatibles: las API, las convenciones y la estructura de archivos pueden diferir de tus datos de entrenamiento. Antes de escribir código, leé la guía correspondiente en `node_modules/next/dist/docs/` (ruta relativa al directorio de este archivo; en monorepos, el paquete `next` puede no estar visible desde la raíz). Prestá atención a los avisos de deprecación.

`next dev` genera y vuelve a agregar este bloque; verificá su comportamiento en `node_modules/next/dist/server/lib/generate-agent-files.js`. Quitarlo de un diff solo vuelve a generar el cambio sin confirmar; incluirlo en el commit de tu trabajo mantiene limpio el árbol de trabajo.

<!-- END:nextjs-agent-rules -->

## Comandos y verificación

- Usá npm y `package-lock.json`; Docker usa Node 22 y `npm ci`.
- `npm run check` ejecuta **typecheck → Vitest → build de producción**. No hay un script de lint.
- Pruebas puntuales: `npm run test -- tests/modules.test.ts`; filtrá un caso con `npm run test -- tests/modules.test.ts -t "case name"`. Vitest usa un entorno Node, no un navegador.
- `scripts/test-n8n-normalization.py` se ejecuta por separado de Vitest y requiere exportaciones privadas de workflows en `C:/ProgramData/Labruna/n8n-web-pilot`; no es una verificación portable de la instalación.

## Configuración local y despliegue

- `.env.example` contiene valores de despliegue. Para desarrollo local, configurá `APP_ORIGIN=http://localhost:3000` y un `TEMP_UPLOAD_DIR` con permisos de escritura (el código usa `.data/uploads` por defecto). Las solicitudes que modifican datos requieren un encabezado `Origin` que coincida con `APP_ORIGIN`.
- Si existe `.env.development.local`, puede sobrescribir `.env`; revisalo cuando la configuración de autenticación o simulación parezca no tener efecto.
- Para una demo de documentos sin cuentas ni n8n, configurá `DEV_AUTH_BYPASS=true` y `N8N_MOCK_MODE=true`, ejecutá `npm run dev` y abrí `/workspace`. La omisión de autenticación se ignora en producción; el modo simulado **no** simula la autorización de Google.
- La autenticación usa Google y autorización por n8n de forma predeterminada; seguí `docs/google-login.md`. El login legado con contraseña requiere `AUTH_PROVIDER=local` y un `USERS_FILE` explícito basado en `config/users.example.json`; generá hashes con `npm run user:hash -- "password-at-least-12-characters"`. Compose no monta ese archivo; la autenticación local en Docker necesita una configuración de override privada.
- `NEXT_PUBLIC_BASE_PATH` queda fijado al compilar y se pasa como argumento de build de Docker. Usá `appPath()` de `lib/app-path.ts` para solicitudes desde el navegador y navegación de página completa; volvé a compilar al cambiar el prefijo.
- `docker compose up -d --build` vincula `127.0.0.1:${APP_PORT:-3100}` con el puerto 3000 del contenedor. Compose no define un servicio ni una red de n8n: `http://n8n:5678` requiere una red Docker compartida o una URL alternativa accesible.

## Memoria

- Al empezar, lee "MEMORY.md" para conocer el estado del proyecto y las decisiones tomadas.
- al terminar una tarea actualizalo: estado actual: decisiones importantes (con su porqué) y errores a evitar.
- mantenlo brebe (maximo aproximadamente 50 lineas): resume o elimina lo que ya no aporte.
- si algo se convierte en una regla permanente, propón moverlo a "AGENTS.md en lugar de dejarlo en la memorias
- no guardes nunca datos sensibles (claves, tokens, datos personales).

## Límites del procesamiento

- `app/workspace/page.tsx` entrega los módulos filtrados por sesión a la interfaz cliente de `processor-workspace.tsx`; `app/api/process/[module]/{analyze,confirm,options}/route.ts` controla el procesamiento del servidor. `@/` apunta a la raíz del repositorio.
- `lib/modules.ts` define los campos de los módulos, esquemas Zod, banderas de activación y claves de negocio. `lib/remitos-sheet.ts` y `lib/sheet-forms.ts` preparan los datos de revisión con la estructura de Sheets: remitos usa `rows` con los encabezados exactos; chapas y cheques usan los nombres de las columnas. Los ejemplos antiguos de `docs/n8n-contracts.md` no representan el esquema actual de revisión; verificá los cambios contra estos helpers y los manejadores de rutas.
- El análisis solo lee Sheets y Drive; la confirmación realiza la escritura. `lib/n8n.ts` envía el archivo original como datos multipart con `X-Workflow-Key` y conserva `requestId` entre análisis y confirmación; n8n también debe mantener la idempotencia de los reintentos. Los workflows existentes de Twilio deben permanecer independientes y activos.
- `lib/files.ts` guarda en disco los binarios pendientes, metadatos, bloqueos de confirmación y comprobantes de resultado en caché; los archivos pendientes vencen a los 30 minutos por defecto y los resultados se conservan durante 24 horas. Este MVP requiere una sola instancia de la aplicación y almacenamiento persistente con permisos de escritura, no réplicas sin estado. Conservá las anotaciones `/* turbopackIgnore: true */` en las lecturas y aperturas dinámicas de archivos.
- El acceso a un módulo requiere tanto su bandera de activación como su inclusión en `allowedModules`; aplicá la validación en el servidor con `requireModuleAccess()`, no solo ocultando módulos en la interfaz.
- Los scripts Python `prepare-*.py` son herramientas operativas de la API de n8n que usan SQLite y datos privados locales de la máquina; no son pasos de build ni de generación de código de la aplicación. `prepare-n8n-web-pilot.py` crea pilotos inactivos cuyas confirmaciones devuelven vistas previas con HTTP 409; `prepare-sheet-options.py` despliega el workflow de listas desplegables.