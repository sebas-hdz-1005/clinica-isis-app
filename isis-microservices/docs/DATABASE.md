# Database

Todas las tablas usan claves `PK` y `SK`, billing on-demand y nombres por ambiente.

## USERS_TABLE

Patrón principal: obtener perfil por usuario Cognito.

Hay un seed de ejemplo con 4 beneficios por usuario en `seeds/dynamodb-seed-example.json`.

```json
{
  "PK": "USER#cognito-sub-id",
  "SK": "PROFILE",
  "cedula": "1023899033",
  "documentType": "CC",
  "name": "María Fernanda Gómez",
  "email": "maria@email.com",
  "phone": "+573001112233",
  "status": "ACTIVE",
  "createdAt": "2026-05-04T10:00:00Z",
  "updatedAt": "2026-05-04T10:00:00Z"
}
```

## BENEFITS_TABLE

Beneficio maestro:

```json
{
  "PK": "BENEFIT#benefit-001",
  "SK": "METADATA",
  "benefitId": "benefit-001",
  "title": "Descuento en consulta especializada",
  "description": "Beneficio disponible para consulta de medicina interna.",
  "terms": "Aplica hasta agotar disponibilidad. No acumulable con otras promociones.",
  "image": "https://...",
  "discountPercentage": 20,
  "validUntil": "2026-06-30",
  "status": "ACTIVE",
  "createdAt": "2026-05-04T10:00:00Z",
  "updatedAt": "2026-05-04T10:00:00Z"
}
```

Asignación:

```json
{
  "PK": "USER#cognito-sub-id",
  "SK": "BENEFIT#benefit-001",
  "benefitId": "benefit-001",
  "assignedAt": "2026-05-04T10:00:00Z",
  "viewed": false,
  "notified": false
}
```

Patrones: listar asignaciones por usuario, obtener metadata por beneficio, detectar inserts con stream.

## NOTIFICATIONS_TABLE

```json
{
  "PK": "USER#cognito-sub-id",
  "SK": "NOTIFICATION#notification-id",
  "notificationId": "notification-id",
  "type": "BENEFIT_ASSIGNED",
  "title": "Nuevo beneficio disponible",
  "message": "Tienes un nuevo beneficio disponible en Clínica Isis.",
  "benefitId": "benefit-001",
  "read": false,
  "createdAt": "2026-05-04T10:00:00Z"
}
```

## DEVICES_TABLE

```json
{
  "PK": "USER#cognito-sub-id",
  "SK": "DEVICE#android#hash",
  "platform": "android",
  "tokenHash": "hash-del-token",
  "snsEndpointArn": "arn:aws:sns:...",
  "enabled": true,
  "createdAt": "2026-05-04T10:00:00Z",
  "updatedAt": "2026-05-04T10:00:00Z"
}
```
