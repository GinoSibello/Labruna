# MEMORY.md — Memoria del proyecto

Última actualización: 2026-10-07. Mantener aproximadamente 50 líneas como máximo, sin datos sensibles.

## Estado actual

- Aplicación interna Next.js para analizar y revisar remitos/facturas, chapas y cheques mediante n8n; Sheets y Drive son el almacenamiento de negocio.
- Se revisaron manifiestos, configuración, documentación y los puntos de entrada del procesamiento para completar `AGENTS.md` con instrucciones verificadas.
- `AGENTS.md` quedó en español por pedido del usuario; incluye comandos, configuración local, despliegue y límites de procesamiento.
- El usuario agregó la sección de memoria en `AGENTS.md`: leer este archivo al iniciar y actualizarlo al terminar cada tarea.
- Remitos conserva la fecha detectada por el modelo (`fecha` o `rows[].Fecha`); si falta, es null o está vacía, usa el día de carga en Buenos Aires.
- Fecha es editable en revisión y se conserva al confirmar. Mes y AÑO siguen automáticos, derivados de esa fecha (ISO o DD/MM/AA[AA]), y se actualizan al editarla.
- Verificación: typecheck y 34 pruebas Vitest correctas. El build agotó el timeout inicial; `npm run build` separado pasó. Servicios externos y despliegue no verificados.
- Publicación solicitada en GitHub sobre `main`: `git fetch origin` confirmó que la base local y remota estaban sincronizadas antes del commit.

## Decisiones (y por qué)

- Conservar el bloque de advertencias de Next.js y sus marcadores: `next dev` lo genera y puede volver a agregarlo.
- Priorizar configuración y código sobre ejemplos del README: se detectaron diferencias en el puerto de Docker y los esquemas de revisión.
- Mantener las reglas permanentes en `AGENTS.md` y usar esta memoria para el estado, decisiones y pendientes; evita duplicar instrucciones que podrían desactualizarse.
- No sobrescribir fechas no vacías del modelo: conservarlas para revisión, incluso si no se reconoce el formato. El respaldo de hoy es solo para fechas ausentes.

## Aprendizajes y errores a evitar

- No copiar `.env.example` para desarrollo sin adaptar el origen y la ruta de uploads: contiene valores de despliegue. `.env.development.local` también puede sobrescribir la configuración.
- No interpretar `N8N_MOCK_MODE=true` como simulación del login de Google; para la demo sin cuentas se necesita además `DEV_AUTH_BYPASS=true` en desarrollo.
- No usar los ejemplos antiguos de `docs/n8n-contracts.md` como esquema de revisión: contrastar con `lib/remitos-sheet.ts`, `lib/sheet-forms.ts` y las rutas de procesamiento.
- No confundir los scripts Python operativos con verificaciones portables: dependen de datos privados de n8n de esta máquina.
- No registrar pruebas o integraciones como exitosas sin ejecutarlas; distinguir revisión de código de verificación en ejecución.
- En este entorno npm/node no están en PATH. Se verificó con el runtime Node local de Codex y npm de AppData/Roaming, agregados solo al PATH del proceso.

## Próximos pasos

- Al iniciar la próxima sesión, leer `AGENTS.md` y esta memoria, y revisar el estado de Git para identificar cambios del usuario.
- No quedó una tarea funcional pendiente acordada; continuar con el próximo pedido del usuario.
- Ante cambios de código, ejecutar la verificación pertinente indicada en `AGENTS.md` y actualizar aquí el resultado real.
