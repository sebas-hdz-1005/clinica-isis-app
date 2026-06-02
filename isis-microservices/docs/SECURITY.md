# Security

## Cognito

La cédula se usa como username en Cognito. Las contraseñas no se guardan en DynamoDB ni en logs. Login, forgot password, confirm password y logout usan Cognito.

## JWT Authorizer

Las rutas privadas usan API Gateway HTTP API JWT Authorizer. Las Lambdas extraen el `sub` desde `requestContext.authorizer.jwt.claims`.

## Endpoint Administrativo

`POST /benefits/assign` requiere JWT y verifica que el claim `cognito:groups` contenga `admin`. En producción se recomienda separar este endpoint en un API administrativo o reforzarlo con WAF y políticas de acceso internas.

## Datos Sensibles

El logger redacciona `password`, `newPassword`, `accessToken`, `idToken`, `refreshToken`, `Authorization`, `code` y `deviceToken`. Las cédulas se enmascaran mostrando solo los últimos 4 dígitos.

## Secretos

`ContentfulAccessToken` es parámetro `NoEcho` en SAM. Para producción se recomienda usar AWS Secrets Manager o SSM Parameter Store y rotación controlada.

## IAM

Cada Lambda recibe permisos acotados a sus tablas y acciones necesarias. SNS usa `CreatePlatformEndpoint` y `Publish` solo en funciones relacionadas con dispositivos y alertas.

## Producción

- Usar dominios concretos en CORS.
- Activar CloudWatch alarms.
- Configurar backup/PITR en DynamoDB.
- Revisar retención de logs.
- Usar grupos Cognito y MFA para administradores.
