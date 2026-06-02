# Deployment

## Build

```bash
npm install
sam build
```

## Deploy Guiado

```bash
sam deploy --guided
```

Parámetros recomendados:

```text
EnvironmentName=dev
CorsAllowedOrigins=*
ContentfulSpaceId=<space>
ContentfulEnvironment=master
ContentfulAccessToken=<token>
ContentfulBlogContentType=blogPost
SnsPlatformApplicationArn=<arn-opcional>
```

## Ambientes

Usa `EnvironmentName=dev`, `qa` o `prod`. Las tablas se nombran como `isis-users-dev`, `isis-benefits-dev`, etc.

## Contentful

Crear content type `blogPost` con campos sugeridos:

- `slug`
- `title`
- `summary`
- `image`
- `content`
- `publishedAt`

Para crear el modelo y 4 noticias iniciales desde este repo:

```bash
CONTENTFUL_SPACE_ID=<space> CONTENTFUL_ENVIRONMENT=master CONTENTFUL_MANAGEMENT_TOKEN=<cma-token> npm run contentful:seed
```

En PowerShell:

```powershell
$env:CONTENTFUL_SPACE_ID="<space>"
$env:CONTENTFUL_ENVIRONMENT="master"
$env:CONTENTFUL_MANAGEMENT_TOKEN="<cma-token>"
npm run contentful:seed
```

## SNS / FCM / APNS

Para push notifications crea una Platform Application en SNS y configura FCM o APNS según corresponda. Pasa el ARN en `SnsPlatformApplicationArn`. Si el ARN queda vacío, se registran dispositivos sin endpoint SNS.

## Validación Post Deploy

- Revisar outputs SAM.
- Crear usuario Cognito de prueba con username igual a cédula.
- Insertar perfil en `USERS_TABLE` usando el `sub` de Cognito.
- Insertar beneficio maestro.
- Probar `/auth/login`, `/users/me`, `/blogs`, `/benefits/me` y `/devices/register`.
