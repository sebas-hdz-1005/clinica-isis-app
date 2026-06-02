# PRD

## Objetivo

Construir APIs backend serverless para que la app móvil de Clínica Isis pueda autenticar usuarios, consultar perfil, leer blogs/noticias, consultar beneficios personalizados y gestionar notificaciones.

## Alcance

Incluye microservicios Node.js para AWS Lambda, API Gateway HTTP API, Cognito, DynamoDB, Contentful, SNS e infraestructura AWS SAM.

No incluye Flutter, pantallas, integración frontend ni administración visual.

## Casos Principales

- Login con cédula y contraseña.
- Recuperación y confirmación de contraseña.
- Consulta de usuario autenticado.
- Listado y detalle de noticias.
- Listado y detalle de beneficios asignados.
- Asignación administrativa de beneficios.
- Notificaciones in-app.
- Registro de dispositivos para push.

## Criterios

El sistema debe ser modular, desplegable por ambiente, sin secretos hardcodeados y con logs seguros.
