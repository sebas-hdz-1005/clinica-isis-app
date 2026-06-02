# Agents

## Reglas

- No implementar Flutter ni frontend.
- Mantener JavaScript ES Modules.
- Usar AWS SDK v3.
- No guardar passwords ni secretos en DynamoDB.
- No imprimir tokens, passwords, códigos, cédulas completas ni device tokens.
- Mantener Lambdas pequeñas y enfocadas.

## Convenciones

- Shared code en `src/shared`.
- Handlers por dominio en `src/functions/<domain>`.
- Respuestas con `successResponse`, `messageResponse` y `errorResponse`.
- Errores con `AppError` y `ERROR_CODES`.
- Validar body con `parseJsonBody` y `validateBody`.

## Agregar Endpoint

1. Crear handler en el dominio correspondiente.
2. Usar `handle()` para errores centralizados.
3. Validar input.
4. Extraer usuario con `getAuthenticatedUser()` si es ruta privada.
5. Agregar recurso en `template.yaml` con permisos mínimos.
6. Documentar en `docs/API.md`.
7. Agregar pruebas unitarias si hay lógica nueva.

## Agregar Tabla

1. Crear recurso DynamoDB en SAM.
2. Agregar variable de entorno global.
3. Conceder permisos solo a Lambdas que la necesiten.
4. Documentar modelo y patrones en `docs/DATABASE.md`.

## Seguridad

Antes de cerrar cambios, revisar que no haya credenciales hardcodeadas ni logs de datos sensibles.
