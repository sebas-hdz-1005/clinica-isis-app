# API

Base URL: output `ApiBaseUrl`.

Rutas privadas requieren:

```http
Authorization: Bearer <accessToken>
```

## POST /auth/login

Body:

```json
{ "cedula": "1023899033", "password": "Password123*" }
```

Response:

```json
{ "success": true, "data": { "accessToken": "...", "idToken": "...", "refreshToken": "...", "expiresIn": 3600, "tokenType": "Bearer" } }
```

Errores: `INVALID_CREDENTIALS`, `USER_NOT_FOUND`, `USER_NOT_CONFIRMED`, `AUTH_PROVIDER_ERROR`.

## POST /auth/forgot-password

Body:

```json
{ "cedula": "1023899033" }
```

Response:

```json
{ "success": true, "message": "Se envió un código de recuperación al medio registrado." }
```

## POST /auth/confirm-forgot-password

Body:

```json
{ "cedula": "1023899033", "code": "123456", "newPassword": "NuevaPassword123*" }
```

Response:

```json
{ "success": true, "message": "Contraseña actualizada correctamente." }
```

## POST /auth/logout

Body:

```json
{ "accessToken": "..." }
```

Response:

```json
{ "success": true, "message": "Sesión cerrada correctamente." }
```

## GET /users/me

Response:

```json
{ "success": true, "data": { "userId": "cognito-sub-id", "cedula": "1023899033", "documentType": "CC", "name": "María Fernanda Gómez", "email": "maria@email.com", "phone": "+573001112233", "status": "ACTIVE" } }
```

Errores: `UNAUTHORIZED`, `PROFILE_NOT_FOUND`, `USER_INACTIVE`, `DATABASE_ERROR`.

## GET /blogs?limit=10&skip=0

Response:

```json
{ "success": true, "data": { "items": [{ "id": "entry-id", "slug": "nueva-unidad-de-atencion", "title": "Nueva unidad de atención", "summary": "Conoce nuestra nueva unidad especializada...", "image": "https://images.ctfassets.net/...", "publishedAt": "2026-05-04T10:00:00Z" }], "pagination": { "limit": 10, "skip": 0, "total": 25 } } }
```

## GET /blogs/{slug}

Response:

```json
{ "success": true, "data": { "id": "entry-id", "slug": "nueva-unidad-de-atencion", "title": "Nueva unidad de atención", "summary": "Conoce nuestra nueva unidad especializada...", "image": "https://images.ctfassets.net/...", "content": { "type": "richText", "json": {} }, "publishedAt": "2026-05-04T10:00:00Z" } }
```

Errores: `BLOG_NOT_FOUND`, `CONTENTFUL_PROVIDER_ERROR`, `VALIDATION_ERROR`.

## GET /benefits/me

Response:

```json
{ "success": true, "data": { "items": [{ "benefitId": "benefit-001", "title": "Descuento en consulta especializada", "description": "Beneficio disponible para consulta de medicina interna.", "image": "https://...", "discountPercentage": 20, "validUntil": "2026-06-30", "status": "ACTIVE", "assignedAt": "2026-05-04T10:00:00Z", "viewed": false }] } }
```

## GET /benefits/{benefitId}

Response:

```json
{ "success": true, "data": { "benefitId": "benefit-001", "title": "Descuento en consulta especializada", "description": "Beneficio disponible para consulta de medicina interna.", "terms": "Aplica hasta agotar disponibilidad. No acumulable con otras promociones.", "image": "https://...", "discountPercentage": 20, "validUntil": "2026-06-30", "status": "ACTIVE", "assignedAt": "2026-05-04T10:00:00Z" } }
```

## POST /benefits/assign

Requiere JWT de usuario en grupo Cognito `admin`.

Body:

```json
{ "userId": "cognito-sub-id", "benefitId": "benefit-001" }
```

Response:

```json
{ "success": true, "message": "Beneficio asignado correctamente.", "data": { "userId": "cognito-sub-id", "benefitId": "benefit-001" } }
```

## GET /notifications/me

Response:

```json
{ "success": true, "data": { "unreadCount": 2, "items": [{ "notificationId": "notification-id", "type": "BENEFIT_ASSIGNED", "title": "Nuevo beneficio disponible", "message": "Tienes un nuevo beneficio disponible en Clínica Isis.", "benefitId": "benefit-001", "read": false, "createdAt": "2026-05-04T10:00:00Z" }] } }
```

## PATCH /notifications/{notificationId}/read

Response:

```json
{ "success": true, "message": "Notificación marcada como leída." }
```

## POST /devices/register

Body:

```json
{ "platform": "android", "deviceToken": "firebase-device-token" }
```

Response:

```json
{ "success": true, "message": "Dispositivo registrado correctamente." }
```
