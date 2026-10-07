# Matriz de casos S11

Dominio: pedidos de cafetería (S10). Usuarias de laboratorio: Ana y Luis. Limpieza global: `POST /api/test/reset` al inicio de la colección. Los IDs de pedido se crean en la misma corrida (`orderId`).


| ID      | Operación                                      | Riesgo                                   | Precondiciones      | Datos                             | Resultado esperado      | Aserciones                                                                 | Limpieza               |
| ------- | ---------------------------------------------- | ---------------------------------------- | ------------------- | --------------------------------- | ----------------------- | -------------------------------------------------------------------------- | ---------------------- |
| AUTH-01 | `POST /api/auth/login`                         | Token mal emitido                        | Reset hecho         | `ana@cafeteria.test` / `demo-ana` | 200 y token de Ana      | status 200; `token` string; `user.email` Ana; guarda `anaToken`            | —                      |
| AUTH-02 | `POST /api/auth/login`                         | Acceso con clave inventada               | Reset hecho         | email Ana y password `nope`       | 401                     | status 401; `code=INVALID_CREDENTIALS`; esquema Error                      | —                      |
| AUTH-03 | `GET /api/orders/1`                            | Recurso protegido sin credencial         | Reset hecho         | sin `Authorization`               | 401                     | status 401; `code=MISSING_TOKEN`; hay `error` string                       | —                      |
| AUTH-04 | `GET /api/orders/1`                            | Token inventado                          | Reset hecho         | `Bearer token-falso`              | 401                     | status 401; `code=INVALID_TOKEN`                                           | —                      |
| ORD-01  | `POST /api/orders`                             | Pedido inválido aceptado                 | AUTH-01             | 1 Café Americano                  | 201, stock baja         | status 201; `status=confirmed`; `totalCents=3500` number; guarda `orderId` | se cancela en CAN-01   |
| ORD-02  | `GET /api/orders/{id}` y `GET /api/products/1` | El create no persistió                   | ORD-01              | token Ana, `orderId`              | 200 y stock 19          | mismo `id` y total; stock Americano = 19                                   | —                      |
| ORD-03  | `POST /api/orders`                             | Pedido vacío                             | AUTH-01             | `{ "items": [] }`                 | 400                     | status 400; `code=EMPTY_ORDER`                                             | no crea fila           |
| ORD-04  | `POST /api/orders`                             | Falta campo obligatorio                  | AUTH-01             | `{}`                              | 400                     | status 400; `code=EMPTY_ORDER`; esquema Error                              | no crea fila           |
| ORD-05  | `GET /api/orders/99999`                        | 200 en recurso inexistente               | AUTH-01             | id 99999                          | 404                     | status 404; `code=ORDER_NOT_FOUND`                                         | —                      |
| ORD-06  | `GET /api/orders/{id}`                         | Fuga de pedido ajeno                     | ORD-01 + login Luis | token Luis, `orderId` de Ana      | 403                     | status 403; `code=FORBIDDEN`                                               | —                      |
| PAG-01  | `GET /api/products?page=1&pageSize=2`          | Página mal cortada                       | Reset               | page=1, pageSize=2                | 200, 2 ítems, total 4   | ids 1 y 2; `totalPages=2`                                                  | —                      |
| PAG-02  | `GET /api/products?page=2&pageSize=2`          | Segunda página vacía o repetida          | Reset               | page=2, pageSize=2                | 200, 2 ítems distintos  | ids 3 y 4; no incluye id 1                                                 | —                      |
| CAN-01  | `PUT /api/orders/{id}/cancel`                  | Cancelar no restaura stock               | ORD-01              | token Ana                         | 200 cancelled, stock 20 | `repeated=false`; `order.status=cancelled`; Americano stock 20             | pedido queda cancelado |
| CAN-02  | `PUT /api/orders/{id}/cancel`                  | Segunda cancelación vuelve a sumar stock | CAN-01              | misma Ana y `orderId`             | 200, efecto igual       | `repeated=true`; status cancelled; stock sigue 20                          | —                      |
| SCH-01  | `GET /api/orders/{id}`                         | Respuesta de éxito no cumple OpenAPI     | CAN-01              | token Ana                         | 200                     | `totalCents` es number; `items` array; `status` enum                       | —                      |
| SCH-02  | `POST /api/auth/login`                         | Error sin `code`                         | Reset               | password inválido                 | 401                     | cuerpo tiene solo `error` string y `code` string                           | —                      |




## Cobertura


| Dimensión del enunciado                | IDs                       |
| -------------------------------------- | ------------------------- |
| Válido + verificación del cambio       | ORD-01, ORD-02, CAN-01    |
| Datos inválidos / obligatorios         | ORD-03, ORD-04            |
| Sin credencial / credencial inválida   | AUTH-02, AUTH-03, AUTH-04 |
| Recurso ajeno                          | ORD-06                    |
| Recurso inexistente                    | ORD-05                    |
| Paginación                             | PAG-01, PAG-02            |
| Idempotencia (efecto, no solo el JSON) | CAN-01 + CAN-02           |
| Esquema éxito / error                  | SCH-01, SCH-02            |


La idempotencia se juzga por el stock del Café Americano y por `status=cancelled`, no porque el POST se repita.