# Labruna Documentos

Aplicación interna para procesar y revisar remitos, planos de chapas y cheques mediante n8n y Gemini. La web convive con los workflows actuales de Twilio: no los reemplaza ni los modifica.

## Qué incluye

- Next.js 16, TypeScript y Docker.
- Login con usuarios precreados, contraseñas Argon2id y sesiones firmadas.
- Permisos y activación independiente por módulo.
- Carga segura de un documento, análisis, revisión editable y confirmación.
- Validación del contenido real de imágenes y PDF.
- Archivos temporales con vencimiento e idempotencia por solicitud.
- Adaptador de webhooks privados para los seis endpoints nuevos de n8n.
- Modo simulado para demostrar la experiencia sin escribir en Sheets o Drive.
- Diseño responsive para escritorio y teléfono.

## Puesta en marcha local

1. Instalar dependencias con `npm install`.
2. Copiar `.env.example` a `.env` y completar sus valores.
3. Crear `secrets/users.json` tomando `config/users.example.json` como base.
4. Generar cada contraseña con:

   ```powershell
   npm run user:hash -- "una-clave-segura-de-al-menos-12-caracteres"
   ```

5. Para probar sin n8n, usar `N8N_MOCK_MODE=true`.
6. Ejecutar `npm run dev` y abrir `http://localhost:3000`.

`DEV_AUTH_BYPASS=true` permite abrir `/workspace` sin cuenta únicamente en desarrollo. La opción se ignora automáticamente en producción.

## Despliegue

1. Configurar las seis URLs privadas de n8n y el secreto compartido.
2. Empezar con `FEATURE_REMITOS=true` y los demás módulos desactivados.
3. Crear el archivo real `secrets/users.json` fuera del repositorio.
4. Configurar `APP_ORIGIN` con el dominio HTTPS exacto.
5. Ejecutar `docker compose up -d --build`.
6. Usar un proxy HTTPS. Hay una base en `deploy/nginx.conf.example`.

El contenedor escucha solamente en `127.0.0.1:3000`. Para que la URL `http://n8n:5678` funcione, la aplicación debe unirse a la misma red Docker de n8n o reemplazarse por su dirección privada real.

## Activación gradual

- `FEATURE_REMITOS`
- `FEATURE_CHAPAS`
- `FEATURE_CHEQUES`

Una cuenta solo ve un módulo si la feature flag está activa y el módulo aparece en `allowedModules`. Desactivar una bandera no afecta Twilio.

## Validación

```powershell
npm run typecheck
npm run test
npm run build
```

Los contratos que deben implementar los workflows nuevos están documentados en [docs/n8n-contracts.md](docs/n8n-contracts.md). El proceso de salida gradual está en [docs/rollout.md](docs/rollout.md).

## Límites deliberados del MVP

No incluye OCR, historial, procesamiento por lotes, cuentas autogestionadas ni trabajos en segundo plano. Google Sheets y Drive continúan siendo el almacenamiento de negocio. Los archivos locales pendientes vencen a los 30 minutos y requieren una sola instancia de la aplicación.
