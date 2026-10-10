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
| Cursor de paginación armado con un `Date` de JS | La página siguiente repite filas: el `Date` trunca a milisegundos y Postgres guarda microsegundos | El cursor lleva `created_at::text` (`src/shared/lib/pagination.ts`); un test pagina 60 filas creadas en la misma transacción. |
| FK simple a una tabla de otra emergencia | Una fila de la emergencia A apunta a una casa de B y la base la acepta | Si la fila tiene `emergency_id`, la FK es compuesta `(x_id, emergency_id)`. |
| Pasar un arreglo de JS dentro de `sql\`\`` de Drizzle | Drizzle lo expande a `($1, $2)` y `unnest(...)` o `= ANY(...)` fallan o comparan mal | `sqlArray(values, "uuid")` de `src/shared/db/sql-array.ts` |
| Exportar desde `"use server"` una función que recibe `source` o un autor | Cualquiera la llama desde el navegador y escribe como coordinador | La escritura en un módulo `server-only`; la acción parsea, aplica la policy y deriva esos valores |
| `ON DELETE RESTRICT` (o `NO ACTION` inmediato) en una FK de catálogo cuyas dos puntas cuelgan de la misma emergencia | Borrar la emergencia falla o pasa según el orden en que Postgres recorre la cascada | `NO ACTION DEFERRABLE INITIALLY DEFERRED`, a mano en una migración `--custom` (drizzle no lo expresa), con test de borrar una emergencia con datos (`tests/emergency-delete.test.ts`) |
| Importar zod (o un SDK) desde `instrumentation-client.ts` o algo que se carga en todas las páginas | El primer bundle crece ~30 KB gzip para cada visita, aunque el servicio esté apagado | Valores públicos planos en `public-env.ts`; SDKs con `import()` detrás de su variable. Comparar el JS de la home antes y después. |
| Asumir que el exportador de Prometheus agrega la unidad al nombre | El PromQL de una alerta busca `_seconds` y no encuentra la serie | Mirar `/metrics` de verdad: solo los contadores llevan `_total`. |
| Aplicar la documentación de Sentry 8 a 10 a Sentry 11 | `sendDefaultPii` se ignora y el SDK manda IP, cuerpos y query strings; se pide un `SentryContextManager` que ya no existe | Leer los tipos instalados (`node_modules/@sentry/*/build/types`), no la guía web: en 11 los datos se controlan con `dataCollection`. |
| Pasar un `Date` a ``sql`...` `` con postgres-js | `ERR_INVALID_ARG_TYPE: Received an instance of Date` al ejecutar | En SQL crudo, `${fecha.toISOString()}::timestamptz`. El query builder de Drizzle sí convierte; `sql` no. |
| Un test de concurrencia que pasa sin el lock | Algo previo serializa a los workers (crear la fila del contador) y el test no prueba el `FOR UPDATE` | Romper el lock a propósito y ver fallar el test; si no falla, preparar el estado para que solo el lock los separe (`tests/notifications/dispatch.test.ts`, tope diario). |
| Editar con un reemplazo por script (`str.replace`, `sed`) sobre un archivo que Prettier ya reformateó | El texto buscado no coincide, el reemplazo no hace nada y el cambio se da por hecho sin estar | Toda edición por script verifica que encontró el texto (`assert old in s`), o se usa la herramienta de edición, que falla si no encuentra. Después, `git diff` del archivo. |
| Parámetro o literal sin tipo en el `SELECT` de un `INSERT … SELECT` o en un `UNION` | `column "emergency_id" is of type uuid but expression is of type text`, igual con enums | Castear en el SQL: `${id}::uuid`, `'claimed'::work_item_event_kind`. En un `SET` o un `WHERE` Postgres infiere el tipo; en una lista de `SELECT`, no |
| Cursor keyset con un `Date` de JS sobre `timestamptz` | La página siguiente repite filas creadas en el mismo milisegundo (Postgres guarda microsegundos) | El cursor lleva el texto que imprime la consulta, `to_char(... AT TIME ZONE 'UTC', '...US"Z"')`, no un `Date` (`src/features/worksites/server/review-queue.ts`) |
