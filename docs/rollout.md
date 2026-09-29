# Salida gradual y convivencia con Twilio

## Iteración 0 — Línea de base

- Exportar versiones de `Auth_Mode`, `RemitosV2`, `ChapasV2` y `Cheques`.
- Confirmar el estado activo de `RemitosV2`.
- Revisar la asignación `N_POLO → N° POLO` en el flujo existente sin modificarla durante las pruebas web.
- Crear copias de prueba de Sheets y de la carpeta de Drive.
- Preparar 20 documentos anonimizados por módulo.
- Registrar los resultados actuales de Twilio como referencia.

## Activación por módulo

Para Remitos, luego Chapas y finalmente Cheques:

1. Importar y configurar los workflows web de analizar y confirmar.
2. Mantener apagada la feature flag pública.
3. Probar los 20 documentos contra recursos de prueba.
4. Ejecutar regresión del workflow de Twilio.
5. Activar el módulo solo para cuentas piloto.
6. Completar cinco días hábiles y al menos 30 operaciones sin incidentes críticos.
7. Habilitar al resto de los usuarios internos.

## Rollback

Ante un incidente:

1. Cambiar `FEATURE_<MODULO>=false`.
2. Reiniciar únicamente el contenedor web.
3. Comunicar a los usuarios que utilicen WhatsApp.
4. Conservar archivos y ejecuciones fallidas solo el tiempo necesario para diagnóstico, sin incluirlos en tickets o logs.
5. Corregir y repetir el corpus antes de reactivar.

No es necesario revertir ni cambiar el workflow de Twilio.

## Métricas mínimas

- Procesamientos iniciados, completados y fallidos por módulo.
- Duración total del análisis y confirmación.
- Reintentos y timeouts.
- Altas frente a actualizaciones.
- Cantidad de advertencias y correcciones, sin registrar el contenido sensible.

## OCR posterior al MVP

Cuando los tres módulos estén estables, comenzar una prueba separada sobre Cheques. El OCR debe ejecutarse antes de Gemini, devolver texto y confianza, y funcionar como fuente adicional. Una falla de OCR no debe bloquear Gemini ni modificar los workflows de Twilio.
