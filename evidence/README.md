# Evidencia Newman

Corridas sobre Collection v2.1 + Newman 6. 18 solicitudes, 44 aserciones.

## Corrección (`newman-pass.txt`)

API arrancada con `npm start` (contrato intacto).

- iterations 1, failed 0
- assertions 44, failed 0

## Incompatibilidad (`newman-fail.txt`)

API arrancada con `BREAK_TOTAL_CENTS=1 npm start`. `totalCents` se serializa como string y contradice `Order.totalCents: integer` en OpenAPI 3.1.

Fallan 4 aserciones, el resto sigue verde:

- ORD-01 `expected '3500' to deeply equal 3500`
- ORD-02 mismo tipo
- CAN-02 mismo tipo
- SCH-01 `expected '3500' to be a number`

No se cambió el OpenAPI ni se quitaron aserciones para ocultar el defecto. Se apagó el flag y se volvió a correr.
