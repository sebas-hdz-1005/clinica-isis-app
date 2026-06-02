# isis-microservices

Backend serverless de microservicios para la app móvil de Clínica Isis. El proyecto expone APIs en AWS Lambda + API Gateway HTTP API, usa Cognito para autenticación, DynamoDB para datos operativos, Contentful para blogs/noticias y SNS como base para push notifications.

No contiene Flutter ni código de frontend.

## Arquitectura

- Auth Service: login, recuperación de contraseña y logout contra Amazon Cognito.
- Users Service: perfil del usuario autenticado desde DynamoDB.
- Blogs Service: listado y detalle de noticias desde Contentful Content Delivery API.
- Benefits Service: beneficios personalizados por usuario y asignación administrativa.
- Notifications Service: notificaciones in-app, registro de dispositivos y alertas push.
- Infrastructure as Code: AWS SAM en `template.yaml`.

## Requisitos

- Node.js 22 o superior.
- npm.
- AWS CLI configurado.
- AWS SAM CLI.
- Cuenta AWS con permisos para crear Lambda, API Gateway, Cognito, DynamoDB, IAM y SNS.

## Instalación

```bash
cd isis-microservices
npm install
```

## Variables

Copia `.env.example` para uso local. En AWS se configuran desde parámetros SAM:

- `ContentfulSpaceId`
- `ContentfulEnvironment`
- `ContentfulAccessToken`
- `ContentfulBlogContentType`
- `SnsPlatformApplicationArn`
- `CorsAllowedOrigins`
- `EnvironmentName`

No se deben hardcodear credenciales, tokens ni secretos.

## Comandos

```bash
npm test
npm run lint
npm run build
npm run deploy:guided
```

## Carga masiva de usuarios desde CSV

El login usa Amazon Cognito: la cédula es el `username` y las contraseñas no se guardan en DynamoDB. El importador crea cada usuario en Cognito con contraseña inicial `Test321*`, toma el `sub` asignado por Cognito y crea el perfil correspondiente en `USERS_TABLE`.

El CSV debe incluir una columna llamada `numero_identificacion`. Ese valor se limpia con `trim()` y se guarda como `cedula`.

```bash
cd isis-microservices
AWS_REGION=us-east-2 \
COGNITO_USER_POOL_ID=<user-pool-id> \
USERS_TABLE=<users-table-name> \
node scripts/import-users-from-csv.js ./usuarios.csv
```

En PowerShell:

```powershell
$env:AWS_REGION="us-east-2"
$env:COGNITO_USER_POOL_ID="<user-pool-id>"
$env:USERS_TABLE="<users-table-name>"
node scripts/import-users-from-csv.js ./usuarios.csv
```

También se puede usar:

```bash
npm run users:import -- ./usuarios.csv
```

El script omite cédulas vacías, duplicadas dentro del CSV o ya existentes en Cognito, y al final muestra `procesados`, `creados`, `omitidos` y `fallidos`.

La identidad AWS usada debe tener permisos para `cognito-idp:AdminGetUser`, `cognito-idp:AdminCreateUser`, `cognito-idp:AdminSetUserPassword` sobre el User Pool y `dynamodb:PutItem` sobre la tabla de usuarios.

## Despliegue

```bash
sam build
sam deploy --guided
```

Durante el deploy define `EnvironmentName` como `dev`, `qa` o `prod`. Al finalizar, SAM entrega `ApiBaseUrl`, `CognitoUserPoolId`, `CognitoClientId` y nombres de tablas.

## Valores AWS a configurar antes de producción

- Crear usuarios en Cognito usando la cédula como username.
- Crear grupo Cognito `admin` y asignar ahí los usuarios que podrán llamar `POST /benefits/assign`.
- Cargar perfiles en `USERS_TABLE` con `PK=USER#<sub>` y `SK=PROFILE`.
- Cargar beneficios maestros en `BENEFITS_TABLE` con `PK=BENEFIT#<benefitId>` y `SK=METADATA`.
- Usar `seeds/dynamodb-seed-example.json` como referencia para dejar cada usuario con más de 3 beneficios asignados.
- Configurar Contentful Space, Content Type `blogPost` y token CDA.
- Configurar SNS Platform Application para FCM/APNS y pasar su ARN si se habilitarán push notifications.

## Seguridad

Las contraseñas viven únicamente en Cognito. Los JWT se validan con API Gateway JWT Authorizer en rutas privadas. El logger redacciona passwords, tokens, códigos, device tokens y enmascara cédulas.

Ver documentación completa en `docs/`.
