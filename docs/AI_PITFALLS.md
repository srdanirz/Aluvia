# AI_PITFALLS

Errores repetibles al generar código, con la disciplina que los evita. Se agrega una fila apenas un error aparece por segunda vez.

## Las 5 causas raíz

| Causa | Cómo se ve | Disciplina |
|---|---|---|
| **APIs alucinadas** | Métodos, opciones o imports que no existen | Leer `docs/CODE_MAP.md` y hacer `grep` antes de escribir. Verificar la API en la documentación de la versión instalada. |
| **Patrones desactualizados** | Pages Router en Next 16, sintaxis vieja de Drizzle o de zod 3 | Revisar la versión en `package.json` y consultar la documentación de esa versión. |
| **Abstracción por imitación** | Factory + Adapter para un problema de 5 líneas | Un patrón entra solo cuando el STYLEGUIDE lo pide por un síntoma real. |
| **Darle la razón a todo** | "Tienes razón, lo revierto" cuando no la tenía | Discutir con evidencia. Una sugerencia de revisión es una hipótesis: se prueba antes de aplicarla. |
| **Pánico ante el error** | `any`, `@ts-ignore`, `catch {}` cuando algo se traba | Volver a leer el error y buscar en la documentación. Nunca suprimirlo. |

## Heredados de otros repos

| Error | Síntoma | Disciplina |
|---|---|---|
| N+1 escondido en un `.map` | `await` o `Promise.all` sobre filas | `findMany({ with })` o `inArray`. El test de conteo lo bloquea. (sur) |
| Precargar una relación en un solo registro "para arreglar un N+1" | Más costo sin loop que lo justifique | Un N+1 necesita un loop. Primero hay que ver que exista. (sur) |
| Commitear caché o artefactos antes de que el `.gitignore` los cubra | Quedan trackeados igual | Antes del primer push: `git ls-files \| grep -E '\.next\|dist\|\.turbo\|\.env'`. (croma) |
| Creer que un control está activo porque el archivo existe | Un hook o workflow que nunca corrió | Verificar que corre (`gh run list`, `git config core.hooksPath`), no que existe. (sur) |
| Un 5xx sin log | Hay que reproducir el fallo a mano para entenderlo | Todo 5xx se registra con su causa. (croma) |
| Llamada externa dentro de una transacción | Bloqueo largo y estado a medias si falla | Primero commit, después el efecto. (sur) |
| `(#NN)` en el subject del commit | Número de PR duplicado al hacer squash | El subject va sin número. (croma) |

## Propios de Aluvia

| Error | Síntoma | Disciplina |
|---|---|---|
| `geometry(..., { srid: 4326 })` de Drizzle | La migración dice `geometry(point)` sin SRID y las filas quedan con SRID 0; el bbox falla con "mixed SRID" | Puntos con `wgs84Point()` de `src/shared/db/schema/types.ts`. Revisar el SQL generado, no solo el schema en TS. |
| Nombre de constraint de más de 63 caracteres | Postgres lo trunca y la siguiente migración ve una diferencia que no existe | FKs compuestas con `name` explícito. |
| Importar de una ruta interna de una dependencia (`drizzle-orm/pg-core/columns/postgis_extension/utils`) | Un upgrade menor la mueve y el build se rompe | Versión exacta en `package.json` y revisar ese import al subirla. |
| FK simple a una tabla de otra emergencia | Una fila de la emergencia A apunta a una casa de B y la base la acepta | Si la fila tiene `emergency_id`, la FK es compuesta `(x_id, emergency_id)`. |
