# STYLEGUIDE

Convenciones de ingeniería de Aluvia. Vienen de reglas que ya funcionan en nuestros otros repos (sur, sonda, croma, StarAIO) y se aplican aquí desde el primer commit. Es un documento vivo: cuando exista el primer ejemplo canónico en Aluvia, la regla pasa a citar su `archivo:línea`, y cada convención nueva entra aquí con su cita.

Lo que una herramienta puede revisar no se escribe aquí: va en el linter, el typecheck o el CI (ver "Lo que revisa la máquina" al final).

Decisiones de base: [stack](adr/0002-stack.md) · [mapa](adr/0006-google-maps.md) · [design system](adr/0004-design-system.md). Lenguaje visual: [DESIGN.md](DESIGN.md).

## Estructura

- **Por feature, no por capa.** Lo que cambia junto vive junto:

  ```
  src/
    app/                    rutas de Next.js: solo componen, no deciden
    features/
      worksites/
        server/             queries.ts (lee) · actions.ts (escribe) · policy.ts (quién puede)
        components/         composiciones de primitivas del design system, nunca estilos propios
        schemas.ts          zod, compartido entre cliente y servidor
        index.ts            API pública de la feature
      work-items/  shifts/  members/  notifications/  map/
    shared/
      ui/                   EL design system: la única carpeta con estilos propios
      db/  i18n/  lib/      solo lo que usan 2 o más features
  ```

- Flujo en un solo sentido: `shared → features → app`. Una feature no importa los archivos internos de otra; usa su `index.ts` o el código se mueve a `shared/`.
- **Una página nunca toca la base de datos.** Llama a `features/<x>/server/`. Esa carpeta es el único lugar con Drizzle o SQL.
- Un archivo hace una sola cosa. Pasado ~200 líneas o con dos responsabilidades, se divide.
- **Registro para lo que crece uno a uno.** Tipos de trabajo y tipos de desastre son datos en un catálogo, no `if` repartidos por el código. Agregar uno no toca nada central.
- **Todo cuelga de una emergencia.** Cada tabla de dominio lleva `emergency_id` y cada consulta filtra por él. Las Condes 2026 es la primera emergencia, no la única.
- **Nada de un desastre en el código de la app.** Tipo, comunas, zona y catálogo de trabajos son configuración de la emergencia en la base (ADR 0009). La única excepción son los seeds revisados de `src/shared/db/seeds/`.

## Datos

- **Una sola base de datos, centralizada.** Todo vive en el mismo Postgres y en el mismo schema. Un caso de uso nuevo agrega tablas con una migración; nunca crea otra base, otra instancia, una colección en Firestore, una planilla ni un servicio con datos propios.
- **Las entidades compartidas se extienden, no se copian.** `emergencies`, `users`, `worksites`, `work_items` y el catálogo de tipos de trabajo existen una vez. Una feature nueva referencia esas tablas con FK; no arma su propia tabla de personas o de casas "para su caso". Antes de crear una tabla, `grep` en `src/shared/db/schema/` y CODE_MAP.
- **El schema vive en un solo lugar**: `src/shared/db/schema/`, un archivo por entidad. Las features importan las tablas desde ahí.
- **Migraciones con `drizzle-kit generate`, commiteadas y revisadas en el PR.** `drizzle-kit push` nunca toca un ambiente compartido.
- Solo migraciones aditivas en un deploy: renombrar o cambiar un tipo se hace en tres PRs (agregar, copiar datos, borrar). (origen: sur, `strong_migrations`)
- Cada FK y cada columna que aparece en un `WHERE` u `ORDER BY` de un listado lleva índice **en la misma migración** que crea la consulta.
- Ubicación como `geometry(Point, 4326)` con el tipo `wgs84Point()` (`src/shared/db/schema/types.ts:16`) y índice GiST. Las consultas por zona usan `ST_Intersects` en la base, nunca se filtra en JS. **Para distancias en metros**, `ST_DWithin(geom::geography, …)` con índice GiST sobre la expresión `(geom::geography)`: sobre `geometry` en 4326, la distancia se mide en grados.
- Instantes en `timestamptz` (UTC). Se muestran en la zona horaria de la emergencia (`emergencies.time_zone`) con `Intl`; los horarios silenciosos de avisos (ADR 0007) también se cuentan en esa zona.
- Los nombres guardados (tablas, columnas, valores de enums) están en inglés desde el día uno: renombrarlos después deja atrás los datos ya escritos. (origen: sonda, `test_persisted_schema.py`)
- Nada se borra en duro mientras dura una emergencia: un trabajo resuelto cambia de estado. Los datos personales se borran al cerrar la emergencia (SECURITY.md).

## Performance: N+1 es regla dura

En una emergencia el link circula por WhatsApp y el tráfico llega de golpe.

- **Ningún `await` de base de datos dentro de un loop**, tampoco `Promise.all(rows.map(...))`: son N consultas igual, solo que en paralelo. Las relaciones se cargan con `findMany({ with })` o con una sola consulta `inArray(ids)`.
- **Todo listado tiene un test de conteo de consultas**: se siembran 1 y 20 filas y el número de consultas tiene que ser el mismo. Es nuestro reemplazo de Bullet. Un listado sin ese test no se mergea.
- Un N+1 necesita un **loop sobre filas**. Una relación leída en un solo registro no es N+1, y precargarla "por si acaso" cuesta sin aportar. (origen: sur)
- Lo que se resuelve por fila (zona, usuario, hora local) se calcula una vez y se pasa como argumento. Un default que cuesta una consulta por fila es peor que un argumento obligatorio. (origen: sur, `days_overdue`)
- **Ninguna consulta sin límite.** Listados con paginación por cursor (keyset), máximo 100 por página. El mapa pide por *bounding box* y agrupa en la base; nunca "todas las casas".
- `columns:` explícito: se trae lo que la vista usa, nunca la fila entera hacia el cliente.
- Un listado nuevo trae su `EXPLAIN ANALYZE` en la descripción del PR.
- Server Components por defecto. `"use client"` solo donde hay interacción: el bundle lo paga el vecino con 3G en la zona afectada.
- Pool de conexiones acotado contra la concurrencia de Cloud Run (instancias × pool ≤ conexiones de Cloud SQL).

## Concurrencia: race conditions

Dos voluntarios van a tocar "tomar" sobre la misma tarea en el mismo segundo. **La garantía la da la base de datos, nunca el JS.**

- **Prohibido leer-y-después-escribir** para decidir algo (`if (!task.claimedBy) await claim()`). Entre la lectura y la escritura otro request ya escribió.
- **Tomar algo = un `UPDATE` condicional.** `UPDATE work_items SET claimed_by = $v, version = version + 1 WHERE id = $id AND claimed_by IS NULL RETURNING id`. Si no devuelve fila, se responde `already_claimed`.
- **Cupos = condición en la misma sentencia, en este orden y en una transacción.** (1) `INSERT` de la inscripción, con índice único parcial `(shift_id, user_id) WHERE cancelled_at IS NULL`; si no insertó, ya estaba inscrito y no se toca el cupo. (2) `UPDATE shifts SET filled = filled + 1 WHERE id = $id AND filled < capacity`; si no actualizó, rollback y `shift_full`. Cancelar no borra: marca `cancelled_at` con un `UPDATE … WHERE cancelled_at IS NULL RETURNING` y, solo si devolvió fila, decrementa `filled` en la misma transacción. Volver a inscribirse crea una fila nueva. La tabla lleva `CHECK (filled <= capacity)`. Nunca contar filas en JS y comparar con el cupo.
- **Las invariantes viven en el schema**: `UNIQUE`, `CHECK`, `NOT NULL`, FKs. Si una regla se puede expresar como constraint, se expresa como constraint, además de validarla en zod.
- **Ediciones concurrentes con bloqueo optimista**: columna `version`; el `UPDATE` lleva `WHERE version = $leída`. Si no actualizó, se responde `stale_version` y la UI pide recargar. Un coordinador nunca sobrescribe en silencio lo que escribió otro.
- **Si de verdad hay que leer antes de escribir**, va en una transacción con `SELECT … FOR UPDATE` sobre la fila. Para repartir trabajo en cola: `FOR UPDATE SKIP LOCKED`.
- **Escrituras de varias filas, en una transacción.** Una casa con sus trabajos se crea completa o no se crea.
- **Reintentos seguros**: el cliente genera el `id` (UUID) de lo que crea y el insert usa `ON CONFLICT (id) DO NOTHING`. Con señal mala, el reintento no duplica la casa. Si el insert no devolvió fila, es un reintento y se responde éxito **sin releer la fila por ese `id`**: un `id` es visible en el mapa público, y releerlo le entregaría a cualquiera los datos de otra casa.
- **Toda operación de "tomar" o "inscribirse" tiene un test de concurrencia**: N requests en paralelo, exactamente uno (o exactamente `capacity`) gana.
- Desactivar el botón tras el clic es UX, no garantía.

## Robustez

- **Validación en la frontera, con zod.** Form, Server Action o route handler parsean con el schema de la feature. Dentro del sistema ya se confía en el tipo.
- **Resultados con tipo cuando hay más de un desenlace:** `{ ok: true, data } | { ok: false, code: "already_claimed" }`. El servidor responde un código, nunca una frase; el cliente lo traduce. (origen: sonda)
- Nada de llamadas externas (SMS, email) dentro de una transacción. Primero el commit, después el efecto.
- Ningún `catch` vacío. Si algo se descarta, hay una razón y va en el log.
- Todo error 5xx se registra con su causa. (origen: croma)
- Configuración faltante falla al arrancar con un mensaje claro, no a mitad de un request.

## Datos personales

Reglas completas en [SECURITY.md](../SECURITY.md). En el código:

- Cada Server Action y route handler llama a la `policy` de su feature antes de leer o escribir. Sin excepción por "es solo lectura".
- **Dos formas de cada casa, en funciones distintas**: la pública (zona aproximada, nivel de daño, tipos de trabajo) y la de coordinador (dirección, teléfono, notas). La pública no tiene forma de devolver campos de contacto: no los selecciona.
- La ubicación pública se generaliza **en la base** (`ST_SnapToGrid`), nunca se manda la exacta para que el cliente la redondee.
- Ver un contacto deja registro (`contact_views`: quién, qué casa, cuándo).
- Logs sin PII: ni teléfono, ni dirección, ni RUT. Se loguea el `id`.
- Endpoints públicos de reporte con límite de tasa por IP.

## Observabilidad

Detalle en [ADR 0008](adr/0008-observabilidad.md). **Una feature no está terminada si no se puede ver funcionando en producción.**

- Cada feature nueva trae en el mismo PR sus **métricas** (OpenTelemetry), sus **eventos** de producto y, si su falla deja a alguien sin ayuda, su **alerta**.
- Los eventos salen solo del catálogo `src/shared/analytics/events.ts`: nombre en `snake_case` y en pasado (`work_item_claimed`), con schema zod. Nada de `track("cualquier cosa")` suelto.
- Ningún evento, métrica, log ni error lleva datos personales. Las etiquetas de una métrica nunca son ids de usuario ni de casa (además de exponer datos, disparan la cardinalidad): se usan ruta, zona, tipo de trabajo, estado.
- Logs en JSON estructurado con el trace id. Un error se registra una vez, donde se maneja, no en cada capa que lo propaga.
- Grafana (propio, en Cloud Run) lee la base solo a través de vistas agregadas y con un usuario de solo lectura.

## Nombres

Un concepto, un nombre, en todas las capas: la tabla `work_items`, la carpeta `features/work-items/`, el tipo `WorkItem`, la ruta `/api/v1/work-items` y el evento `work_item_claimed` hablan de lo mismo y se encuentran con un solo `grep`.

### Reglas generales

- Identificadores, comentarios, rutas y nombres guardados en **inglés**. Términos chilenos sin equivalente se quedan en español: `comuna`, `rut`, `fibe`.
- Describir la operación, sin metáforas: `claimWorkItem`, no `grabTask` ni `pickUp`.
- Funciones planas, verbo + entidad (`getWorksite`, `claimWorkItem`), sin namespaces: se importan sueltas y se encuentran con `grep`.
- Sin abreviaturas salvo las universales (`id`, `url`): `worksite`, no `ws`.
- Booleanos con `is`/`has`/`can`: `isVerified`, `hasVulnerablePeople`, `canClaim`.
- Constantes de umbral en `SCREAMING_SNAKE_CASE`, arriba del archivo, con el porqué del número.
- **Unidades con nombre propio** (un worker, un servicio, una herramienta interna) llevan un nombre corto con carácter, sin sufijo de función (`Service`, `Manager`, `Worker`): lo proponemos con 2 o 3 opciones y lo eligen los mantenedores. Las funciones y variables nunca llevan nombres así.

### Verbos (uno por concepto)

| Verbo | Significa | Ejemplo |
|---|---|---|
| `list` | Varios, paginado | `listWorksitesInArea` |
| `get` | Uno por id; lanza si no existe | `getWorksite` |
| `find` | Uno por criterio; puede devolver `null` | `findOpenShift` |
| `count` | Un número | `countUnclaimedWorkItems` |
| `create` / `update` | Insertar / modificar | `createWorksite` |
| `claim` / `release` | Tomar / soltar algo con dueño | `claimWorkItem` |
| `mark` | Cambiar a un estado (también cerrar: no hay `delete` durante la emergencia) | `markWorkItemDone` |
| `cancel` | Anular algo propio, dejando registro (`cancelled_at`) | `cancelShiftSignup` |
| `purge` | El único borrado en duro: datos personales al cerrar la emergencia (ADR 0005) | `purgeEmergencyPersonalData` |
| `send` | Sale de la app (notificación, email) | `sendShiftReminder` |

### Por capa

| Qué | Forma | Ejemplo |
|---|---|---|
| Carpeta de feature | `kebab-case`, inglés. Si es una entidad, el nombre de su tabla en plural; si es una capacidad sin tabla propia, en singular | `features/work-items/`, `features/members/` (tabla `emergency_members`), `features/map/` |
| Archivos | `kebab-case` | `work-item-card.tsx`, `queries.ts` |
| Componentes y tipos | `PascalCase`, sin prefijo `I` | `WorkItemCard`, `Worksite` |
| Funciones, variables, hooks | `camelCase`; hooks con `use` | `listWorksitesInArea`, `useMapBounds` |
| Schemas zod | nombre + `Schema` | `worksiteReportSchema` |
| Server Actions | verbo + entidad, exportadas desde `server/actions.ts` | `claimWorkItem` |
| Tablas | `snake_case`, plural | `work_items`, `shift_signups` |
| Columnas | `snake_case`; FK `<entidad>_id`; FK a `users` con rol, `<rol>_by`; instantes `_at`; fechas `_on`; booleanos `is_`/`has_` | `worksite_id`, `claimed_by`, `created_at`, `is_verified` |
| Valores de enum | `snake_case` | `needs_follow_up` |
| Índices y constraints | `<tabla>_<columnas>_<tipo>` | `work_items_emergency_id_status_idx` |
| Variables de entorno | `SCREAMING_SNAKE_CASE`; `NEXT_PUBLIC_` solo si el navegador la necesita | `DATABASE_URL`, `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` |
| Claves de traducción | `feature.pantalla.elemento`, en `camelCase`. Excepción: `errors.<code>` conserva el `snake_case` del código, para traducirlo directo | `workItems.detail.claimButton`, `errors.already_claimed` |
| Códigos de error | `snake_case`, describen el qué | `already_claimed`, `shift_full` |
| Eventos de producto | `snake_case`, entidad + verbo en pasado | `work_item_claimed` |
| Métricas | En código (OpenTelemetry): puntos, prefijo `aluvia.`, unidad aparte. El exportador a Prometheus agrega `_seconds`/`_total`; no se escriben a mano | Código: `aluvia.map.bbox.duration` (unidad `s`). PromQL: `aluvia_map_bbox_duration_seconds` |
| Ramas | `tipo/descripcion-en-kebab` | `feat/claim-work-item` |

### Rutas y endpoints

- **Páginas:** segmentos en inglés, `kebab-case`, sustantivos en plural, sin verbos, colgando de la emergencia (ADR 0009): `/emergencies/[slug]/worksites/[id]`, `/emergencies/[slug]/shifts/[id]`. Si un idioma necesita URLs traducidas, se hace con los *pathnames* localizados de next-intl, sin renombrar carpetas.
- **Quién usa qué:**
  - **Mutaciones de la app → Server Actions** (`claimWorkItem`, `createWorksite`, `subscribeToPush`). No hay endpoint para eso.
  - **Lecturas del cliente → route handler `GET`**, para lo que el navegador pide solo (el mapa por bbox con TanStack Query). Lo que se lee al renderizar lo hace el Server Component directo con `queries.ts`.
  - **Terceros y procesos → route handlers**: webhooks de proveedores, exportación para el municipio, el worker de notificaciones.
- **Route handlers:** versionados y REST, `/api/v1/<recurso-en-plural>`. Ejemplos de cada categoría:
  - `GET /api/v1/emergencies/[slug]/worksites?bbox=…&cursor=…` (lectura del mapa).
  - `GET /api/v1/emergencies/[slug]/exports/worksites` (exportación para el municipio).
  - `POST /api/v1/webhooks/<proveedor>` (estado de entrega de un SMS).
  - Una acción que no es CRUD es un subrecurso con verbo, siempre `POST`: `POST /api/v1/notifications/dispatch` (el worker).
  - Query params en `camelCase` (`pageSize`, `cursor`), igual que el JSON.
- **Respuestas:** JSON en `camelCase`. Éxito: el recurso, o `{ items, nextCursor }` en listas. Error: `{ code, details? }` con el status HTTP que corresponda (`409` para `already_claimed`, `422` para validación). Nunca una frase: el cliente traduce el `code`.
- Un cambio que rompe el contrato de `/api/v1` va en `/api/v2`; los clientes de afuera no se rompen.

## Comentarios

El criterio es el nivel de detalle, no la cantidad.

- **Arriba:** qué promete el módulo a quien lo llama y qué no debe asumir.
- **Abajo:** el porqué que no es obvio, una medición, una trampa, la razón de una constante.
- Nunca el QUÉ al mismo nivel del código, ni historial ("antes era X").

## UI: design system estricto

Detalle y razones en [ADR 0004](adr/0004-design-system.md). La regla corta: **si no existe en `src/shared/ui/`, no existe.**

- **Toda pieza visual sale de `src/shared/ui/`** (shadcn/ui sobre Tailwind v4). Las features componen esas primitivas; no las reimplementan ni las "ajustan" por fuera.
- **Si falta una primitiva, se agrega a `shared/ui/` en su propio PR**, con sus variantes, antes de usarla. Nunca se crea una versión local en la feature.
- **Variantes, no overrides.** Un botón distinto es una variante nueva en `button.tsx` (`cva`), no un `className` que lo sobrescribe desde afuera.
- **Prohibido fuera de `shared/ui/`:** `<table>`, `<button>`, `<input>`, `<select>`, `<dialog>` crudos; el prop `style`; valores arbitrarios de Tailwind (`w-[37px]`, `bg-[#f00]`); el modificador `!` y `!important`; colores, radios o sombras que no sean tokens.
- **Tablas = `DataTable` del design system** (se agrega a `shared/ui` cuando la primera pantalla la necesite). Nada de tablas armadas a mano por feature.
- **Tokens en un solo lugar**: `src/shared/ui/theme.css` (`@theme`), con los valores de [DESIGN.md](DESIGN.md). Ese archivo **resetea la paleta y las escalas por defecto de Tailwind** (`--color-*: initial;` y lo mismo para radio, sombra, espaciado y fuente), así `bg-red-500` o `shadow-lg` dejan de existir y solo quedan nuestros tokens (`bg-surface`, `text-ink-soft`).
- **Estados de trabajo = `Chip`** con su `tone` (`urgent`, `pending`, `done`, `closed`). Ningún otro archivo decide el color de un estado.
- **Sin bordes y un color por pieza** (DESIGN.md). El lint rechaza `border`, `outline`, `ring` y `divide` fuera de `shared/ui`.
- **Carga uniforme:** cada ruta tiene un `loading.tsx` hecho con `Skeleton` en la forma de la vista; los datos de la vista se piden en paralelo en un solo lugar y aparecen juntos. Nada de `Suspense` anidados que hagan llegar partes a destiempo.
- **Temas claro, oscuro y automático desde el día uno** (DESIGN.md). Los componentes usan tokens y no saben en qué tema están: `dark:` solo existe dentro de `src/shared/ui/`.
- **Celular, tablet y escritorio.** Cada pantalla se diseña para los tres rangos de DESIGN.md y Playwright la recorre a 375, 768, 1024 y 1440 px. La app es una PWA instalable (manifest e íconos), para que el vecino la abra desde la pantalla de inicio.

### Idiomas

Agregar un idioma a la interfaz tiene que ser **agregar un archivo**, sin tocar código.

- Los idiomas viven en un registro (`src/shared/i18n/locales.ts`). Agregar uno es una línea ahí más `messages/<código>.json`.
- **Todo texto de la interfaz sale de `messages/*.json`** vía next-intl, también `alt`, `aria-label`, `title`, mensajes de error y correos.
- **Excepción: datos de una emergencia** (su nombre, sus tipos de trabajo). Vienen de la base en `jsonb` por idioma, con respaldo en el idioma por defecto de la emergencia. El admin muestra qué falta traducir (ADR 0009).
- Nada de armar frases concatenando pedazos: una frase es una clave con variables (`"{count, plural, one {# casa} other {# casas}}"`). El orden de las palabras cambia entre idiomas.
- Fechas, números, monedas y listas por `Intl` con el locale activo, nunca con `"es-CL"` fijo. (origen: sonda)
- El servidor responde códigos (`already_claimed`), nunca frases.
- Los layouts aguantan un texto un 40 % más largo que el español: nada de anchos fijos para texto, nada de texto dentro de imágenes.
- Propiedades lógicas en vez de izquierda/derecha, para que un idioma de derecha a izquierda no obligue a rehacer pantallas: `ms-`/`me-`, `ps-`/`pe-`, `start-`/`end-` (no `inset-s-`/`inset-e-`: una sola forma), `text-start`/`text-end`, `rounded-s`/`rounded-e`, `border-s`/`border-e`, `scroll-ms-`/`scroll-ps-`, `float-start`/`float-end`.
- Un test verifica que todos los archivos de `messages/` tengan exactamente las mismas claves.
- Español neutro LATAM. Sin emojis y sin guion largo (U+2014) en ningún texto del repo: se usan conectores ("porque", "así que", "pero"), dos puntos, punto o `·`. El CI lo rechaza.
- Íconos Lucide, monolínea, sin contenedor de fondo.
- Un estado siempre lleva etiqueta escrita además del color: con sol, en la calle, el color solo no se distingue.
- Pensado primero para celular, con una mano: objetivos táctiles de 44 px o más.

## Tests

- Integración contra **Postgres + PostGIS real** (contenedor), sin mocks de la base de datos. Un mock no detecta un N+1, una carrera ni una consulta geográfica mal hecha.
- Datos de prueba inventados, siempre. Nunca direcciones reales.
- Tiempo fijo en los tests, nunca `Date.now()` real.
- Un test nuevo se rompe a propósito una vez para verlo fallar.
- Playwright cubre el flujo que no puede romperse: reportar una casa → aparece en el mapa → un voluntario toma un trabajo.

## Lo que revisa la máquina

Va en la configuración del scaffold y el CI lo exige en cada PR:

- `tsc` strict con `noUncheckedIndexedAccess`.
- ESLint con tipos (`parserOptions.projectService`): `no-await-in-loop`, `no-console`, `@typescript-eslint/no-explicit-any`, `@typescript-eslint/no-floating-promises`, `@typescript-eslint/ban-ts-comment`.
- ESLint de UI, fuera de `src/shared/ui/`: `no-restricted-syntax` contra los elementos crudos y el prop `style`; `better-tailwindcss/no-restricted-classes` contra valores arbitrarios y el `!` (en v4 va al final, `bg-x!`, y el patrón cubre prefijo y sufijo), el variante `dark:`, las clases físicas (`ml-`, `mr-`, `-ml-`, `-mr-`, `pl-`, `pr-`, `left-`, `right-`, `text-left`, `text-right`, `rounded-l`, `rounded-r`, `border-l`, `border-r`, `scroll-m[lr]-`, `scroll-p[lr]-`, `float-left`, `float-right`, `clear-left`, `clear-right`) y la forma lógica alternativa `inset-s-`/`inset-e-`; `better-tailwindcss/no-unknown-classes`, que con los defaults reseteados en `theme.css` rechaza toda clase que no sea un token.
- Stylelint `declaration-no-important`.
- Prettier, Vitest (incluye conteo de consultas y concurrencia), build de Next.js, gitleaks.
