# S11 — Validación de API con Postman y OpenAPI

API de pedidos de cafetería. Reutiliza el dominio de la Semana 10 (productos, stock, órdenes) y añade autenticación con dos usuarias, paginación, consulta protegida y cancelación idempotente.

No hay interfaz nueva ni despliegue público.

```text
Postman / Newman
        ↓
API Express  (server/)
        ↓
SQLite local (data/cafeteria.db)  — motor node:sqlite
```

## Versiones

| Pieza | Versión |
| --- | --- |
| Node.js | 22 o superior (probado en 24) |
| Express | 5.2 |
| OpenAPI | 3.1.0 (`openapi/openapi.yaml`) |
| Colección Postman | Collection v2.1.0 |
| Newman | 6.x (CLI) |
| Postman app | Collection Runner, importar los JSON de `postman/` |

## Requisitos

Node.js ≥ 22. No hace falta instalar SQLite ni cuentas reales.

## Preparación de datos

Dos fixtures de laboratorio (no son secretos ni datos personales reales):

| Persona | Email | Password | Token |
| --- | --- | --- | --- |
| Ana | ana@cafeteria.test | demo-ana | demo-token-ana |
| Luis | luis@cafeteria.test | demo-luis | demo-token-luis |

El ambiente exportable (`postman/cafeteria.postman_environment.json`) solo trae `baseUrl`. Las claves van en la colección como datos de prueba.

Al arrancar, o con reset:

```bash
npm install
npm run db:reset
# o
curl -X POST http://127.0.0.1:3000/api/test/reset
```

Quedan 4 productos (ids 1–4), 0 pedidos, Ana y Luis. La colección empieza siempre por `[SETUP-01]`, así no depende de un `orderId` de otra corrida.

## Iniciar la API

```bash
npm start
```

Escucha en http://127.0.0.1:3000

## Ejecutar las pruebas

### Postman CLI (Newman)

Con la API encendida, en otra terminal:

```bash
npm run test:api
```

Equivale a:

```bash
npx newman run postman/cafeteria.postman_collection.json \
  -e postman/cafeteria.postman_environment.json \
  --reporters cli,json \
  --reporter-json-export evidence/newman-last.json
```

Deben pasar **16 solicitudes** de caso (más el reset): AUTH, ORD, PAG, CAN, SCH.

### Collection Runner (app Postman)

1. Importar `postman/cafeteria.postman_collection.json`.
2. Importar `postman/cafeteria.postman_environment.json` y seleccionarlo.
3. Runner → la colección → Run.

## Contrato

- Especificación: [`openapi/openapi.yaml`](openapi/openapi.yaml)
- Matriz (16 casos): [`docs/matriz.md`](docs/matriz.md)

`PUT /api/orders/{id}/cancel` es idempotente en el **efecto**: el pedido queda `cancelled` y el stock del Café Americano no se suma dos veces. No se usa un header de idempotencia ni se asume que POST lo sea.

Los tests de esquema (SCH-01, SCH-02) comprueban tipos y campos requeridos del OpenAPI. No son un validador OpenAPI completo (no hay Spectral/openapi-validator en la corrida).

## Incompatibilidad controlada

OpenAPI declara `Order.totalCents` como **integer**. El servidor puede violarlo así:

```bash
BREAK_TOTAL_CENTS=1 npm start
npm run test:api
```

`ORD-01` / `SCH-01` fallan porque `totalCents` llega como string. Evidencia: [`evidence/newman-fail.txt`](evidence/newman-fail.txt).

Corrección: arrancar **sin** esa variable (`npm start`) y volver a correr. Evidencia: [`evidence/newman-pass.txt`](evidence/newman-pass.txt). No se relajó el contrato.

## Entrega

- Matriz, OpenAPI, colección y ambiente están en este repo.
- PDF de Canvas: identificación, URL del repo, URL del video y captura de Newman.
- Video ≤ 3 min: app y riesgos, corrida, un 401/403, la incompatibilidad, la corrección y una limitación (no hay validación OpenAPI de punta a punta).

## Uso de IA

**Herramienta:** Cursor.

**Uso:** proponer la matriz, el OpenAPI y los scripts de Newman.

**Verificación propia:** ejecutar Newman en local, revisar que el 403 de Luis, la paginación y el stock de la segunda cancelación coinciden con SQLite. Los fixtures se leyeron del reset, no de una corrida anterior.

## Limitación de las pruebas

Newman afirma tipos y códigos. No ejecuta un validador OpenAPI contra cada respuesta. Un campo extra no declarado puede colarse. La idempotencia se mide con stock, no con un hash del body.
