# MEMORY.md — Memoria del proyecto

Última actualización: 2026-10-06. Mantener aproximadamente 50 líneas como máximo, sin datos sensibles.

## Estado actual

- Aplicación interna Next.js para analizar y revisar remitos/facturas, chapas y cheques mediante n8n; Sheets y Drive son el almacenamiento de negocio.
- Se revisaron manifiestos, configuración, documentación y los puntos de entrada del procesamiento para completar `AGENTS.md` con instrucciones verificadas.
- `AGENTS.md` quedó en español por pedido del usuario; incluye comandos, configuración local, despliegue y límites de procesamiento.
- El usuario agregó la sección de memoria en `AGENTS.md`: leer este archivo al iniciar y actualizarlo al terminar cada tarea.
- En esta sesión solo se modificó documentación. `git diff --check` pasó; no se ejecutaron pruebas, build ni verificaciones de servicios externos.
- El funcionamiento del despliegue y los workflows activos no se verificó en esta sesión.
- Antes de publicar esta documentación, se ejecutó `git fetch origin`: `main` y `origin/main` estaban sincronizadas, sin commits divergentes.

## Decisiones (y por qué)

- Conservar el bloque de advertencias de Next.js y sus marcadores: `next dev` lo genera y puede volver a agregarlo.
- Priorizar configuración y código sobre ejemplos del README: se detectaron diferencias en el puerto de Docker y los esquemas de revisión.
- Mantener las reglas permanentes en `AGENTS.md` y usar esta memoria para el estado, decisiones y pendientes; evita duplicar instrucciones que podrían desactualizarse.

## Aprendizajes y errores a evitar

- No copiar `.env.example` para desarrollo sin adaptar el origen y la ruta de uploads: contiene valores de despliegue. `.env.development.local` también puede sobrescribir la configuración.
- No interpretar `N8N_MOCK_MODE=true` como simulación del login de Google; para la demo sin cuentas se necesita además `DEV_AUTH_BYPASS=true` en desarrollo.
- No usar los ejemplos antiguos de `docs/n8n-contracts.md` como esquema de revisión: contrastar con `lib/remitos-sheet.ts`, `lib/sheet-forms.ts` y las rutas de procesamiento.
- No confundir los scripts Python operativos con verificaciones portables: dependen de datos privados de n8n de esta máquina.
- No registrar pruebas o integraciones como exitosas sin ejecutarlas; distinguir revisión de código de verificación en ejecución.

## Próximos pasos

- Al iniciar la próxima sesión, leer `AGENTS.md` y esta memoria, y revisar el estado de Git para identificar cambios del usuario.
- No quedó una tarea funcional pendiente acordada; continuar con el próximo pedido del usuario.
- Ante cambios de código, ejecutar la verificación pertinente indicada en `AGENTS.md` y actualizar aquí el resultado real.
