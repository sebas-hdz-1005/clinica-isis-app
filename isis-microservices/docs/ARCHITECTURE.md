# Architecture

## Diagrama Textual

Mobile App -> API Gateway HTTP API -> JWT Authorizer Cognito -> AWS Lambda por dominio -> DynamoDB / Contentful / SNS

DynamoDB Benefits Stream -> ProcessBenefitAssignmentStreamFunction -> Notifications + SNS

## Microservicios

- Auth: delega credenciales y recuperación de contraseña a Cognito.
- Users: consulta perfiles en `USERS_TABLE`.
- Blogs: consume Contentful CDA y mapea respuestas móviles.
- Benefits: consulta asignaciones y metadata en `BENEFITS_TABLE`.
- Notifications: consulta notificaciones, marca leídas, registra dispositivos y envía alertas.

## Flujo Login

`POST /auth/login` recibe cédula y contraseña, llama `InitiateAuth` con `USER_PASSWORD_AUTH` y devuelve tokens Cognito. La contraseña no se guarda ni se imprime.

## Flujo Perfil

`GET /users/me` requiere JWT. API Gateway valida el token, Lambda toma `sub` desde claims y consulta `PK=USER#<sub>`, `SK=PROFILE`.

## Flujo Blogs

`GET /blogs` y `GET /blogs/{slug}` consultan Contentful con `CONTENTFUL_BLOG_CONTENT_TYPE`. El listado solo devuelve resumen; el detalle devuelve rich text completo.

## Flujo Beneficios

`GET /benefits/me` consulta asignaciones `PK=USER#<sub>`, `SK begins_with BENEFIT#` y combina con metadata `PK=BENEFIT#<benefitId>`, `SK=METADATA`.

`POST /benefits/assign` exige usuario en grupo Cognito `admin`, valida usuario y beneficio, crea asignación y dispara alerta.

## Flujo Notificaciones

Al asignar beneficio se crea una notificación in-app y se intenta enviar push a dispositivos activos. Si SNS falla, el proceso registra un log seguro y conserva la notificación.
