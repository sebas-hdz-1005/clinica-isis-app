# Clinica ISIS

## Estructura

```text
.
|-- contentful/
|   `-- blog-content-type.json
|-- frontend/
|   |-- lib/
|   |   `-- contentful.js
|   |-- pages/
|   |   |-- api/blog.js
|   |   |-- _app.js
|   |   |-- blog.js
|   |   |-- embed.js
|   |   `-- index.js
|   |-- styles/globals.css
|   |-- .env.example
|   |-- next.config.js
|   `-- package.json
|-- infrastructure/
|   `-- template.yaml
|-- scripts/
|   |-- create-contentful-blog-model.sh
|   |-- deploy-backend.sh
|   |-- get-api-url.sh
|   `-- test-endpoints.sh
`-- package.json
```

## AWS

```bash
./scripts/deploy-backend.sh
./scripts/test-endpoints.sh
```

Comando de prueba directa:

```bash
curl "$(./scripts/get-api-url.sh)?cedula=1234567890"
curl "$(./scripts/get-api-url.sh)?cedula=0000000000"
```

Endpoint desplegado:

```bash
https://y2ylrfyuy1.execute-api.us-east-2.amazonaws.com/validar
```

La plantilla crea:
- DynamoDB `Pacientes` con PK `cedula`
- Registro de prueba `1234567890`
- Lambda Node.js 18 `clinica-isis-validar-paciente`
- API Gateway HTTP `GET /validar`
- CORS abierto para pruebas
- Logs en CloudWatch
- IAM roles con permisos minimos

## Contentful

### Crear modelo por API

```bash
export CONTENTFUL_SPACE_ID="tu_space_id"
export CONTENTFUL_ENVIRONMENT="master"
export CONTENTFUL_MANAGEMENT_TOKEN="tu_cma_token"
./scripts/create-contentful-blog-model.sh
```

### Crear modelo por UI

1. Entra a `Content model`.
2. Crea un content type llamado `blog`.
3. Agrega campos:
   - `title` -> Short text
   - `slug` -> Short text
   - `content` -> Rich text
   - `image` -> Media
   - `createdAt` -> Date and time
4. Marca `title`, `slug`, `content`, `createdAt` como requeridos.
5. Publica el modelo.

## Frontend

1. Instala dependencias:

```bash
npm run install:frontend
```

2. Crea `frontend/.env.local` desde `frontend/.env.example` y define:

```bash
NEXT_PUBLIC_API_BASE_URL="https://y2ylrfyuy1.execute-api.us-east-2.amazonaws.com"
NEXT_PUBLIC_SITE_URL="https://tu-dominio-o-subdominio-amplify"
CONTENTFUL_SPACE_ID="tu_space_id"
CONTENTFUL_ENVIRONMENT="master"
CONTENTFUL_ACCESS_TOKEN="tu_cda_token"
```

3. Levanta Next.js:

```bash
npm run dev
```

## Rutas

- `/` valida cedulas contra AWS
- `/blog` lista articulos publicados desde Contentful
- `/blog/:slug` expone cada articulo con URL propia
- `/embed` embebe `/blog` dentro de un iframe

## Amplify

El repo incluye `amplify.yml` para desplegar el frontend ubicado en `frontend/`.

Variables recomendadas en Amplify:

- `NEXT_PUBLIC_API_BASE_URL`
- `NEXT_PUBLIC_SITE_URL`
- `CONTENTFUL_SPACE_ID`
- `CONTENTFUL_ENVIRONMENT`
- `CONTENTFUL_ACCESS_TOKEN`

Para que cada publicacion nueva en Contentful salga con su propia URL en la app sin usar SSR, la opcion recomendada es conectar un webhook de Contentful que dispare un nuevo build en Amplify.
