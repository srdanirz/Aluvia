# DESIGN

Lenguaje visual de Aluvia. Se lee **antes de diseñar o construir cualquier pantalla**. Es la especificación; la implementación es `src/shared/ui/theme.css`, y si difieren manda `theme.css` y este archivo se corrige en el mismo PR. Reglas de uso fuera de `shared/ui/`: [ADR 0004](adr/0004-design-system.md) y [STYLEGUIDE](STYLEGUIDE.md). Catálogo vivo: `/es/dev/ui`.

## Dirección

Paneles de vidrio sobre un fondo luminoso, luces iridiscentes, piezas en forma de pastilla y colores sólidos. Referencias: interfaces de seguimiento con mapa (lista de tarjetas a un lado, mapa al otro, detalle flotando abajo) y el brillo ambiental de Apple Intelligence.

**Reglas que no se discuten:**

1. **Sin bordes.** Una pieza se separa con espacio, con otro tono de superficie o con sombra, nunca con una línea. El lint rechaza `border`, `outline`, `ring` y `divide` fuera de `shared/ui`. La única línea es el anillo de foco cuando se navega con teclado en botones y enlaces (accesibilidad); los campos muestran el foco con un halo suave de color `accent`.
2. **Un color por pieza.** Un botón es un relleno sólido (o un degradado), nunca un relleno de un color con un borde de otro.
3. **Pastillas.** Botones, chips, selectores y navegación son `rounded-full`. Tarjetas y paneles, radios grandes. Tres o más acciones en fila se unen en una pastilla larga (`ButtonGroup`).
4. **Luz, no líneas.** La profundidad la dan el vidrio, las luces iridiscentes (`glass-wash`) y la sombra.
5. **Carga uniforme.** Una vista aparece entera de una vez (ver Carga).

## Color

Marca: **negro, blanco, rosado `#EF318C` e índigo `#3334E6`**. El rosado marca lo que necesita ayuda; el índigo, lo que está en curso y la acción destacada.

| Token | Claro | Oscuro | Uso |
|---|---|---|---|
| `canvas` | `#F5F6FB` | `#0B0C12` | Fondo de página, bajo la aurora. |
| `surface` | `#FFFFFF` | `#16171F` | Tarjetas. |
| `surface-muted` | `#E9EBF5` | `#1E2029` | Botones secundarios, campos, selector no elegido. |
| `ink` | `#0A0B10` | `#F2F3F8` | Texto principal y texto de chips. |
| `ink-soft` | `#3D3F52` | `#C3C6D6` | Texto secundario. |
| `ink-muted` | `#62657A` | `#9A9DB2` | Ayudas y metadatos. Mínimo para texto. |
| `action` / `on-action` | `#000000` / `#FFFFFF` | `#FFFFFF` / `#000000` | Botón principal, ítem activo. |
| `accent` / `on-accent` | `#3334E6` / `#FFFFFF` | `#8E8FFF` / `#0B0C12` | Acción destacada, foco, links. |
| `accent-tint` | `#E5E5FC` | `#23244A` | Tarjeta seleccionada. |
| `status-urgent` / `-tint` | `#EF318C` / `#FDE4F0` | `#FF5FA8` / `#3A1A2B` | Sin tomar, grave. Solo punto, relleno o texto grande. |
| `status-urgent-text` | `#C2186B` | `#FF5FA8` | Texto de error (el rosado de marca no llega a AA en texto chico). |
| `status-pending` / `-tint` | `#3334E6` / `#E5E5FC` | `#8E8FFF` / `#23244A` | Tomado, en curso. |
| `status-done` / `-tint` | `#0F9D58` / `#DDF4E8` | `#4AD295` / `#143326` | Hecho. |
| `status-closed` / `-tint` | `#8B8EA3` / `#EEF0F5` | `#9A9DB2` / `#23252F` | Cerrado sin hacer. |
| `glass` | blanco al 62 % | `#16171F` al 60 % | Relleno de lo que flota. |
| `glass-hover` | blanco al 75 % | blanco al 8 % | Hover de piezas discretas o translúcidas: un vidrio más claro, nunca un gris sólido. |
| `aurora-1/2/3` | `#8D9FFF`, `#F5B9EA`, `#C686FF` | los mismos, más tenues | Fondo ambiental y luces. Son los tonos del brillo de Apple Intelligence. |

Contraste medido: todo texto cumple AA (4,5:1) sobre `canvas` y `surface` en los dos temas; `text-iridescent` usa un tono medio más oscuro en claro (`#7C3AED`) para no bajar de 3:1 en tamaño grande. El rosado de marca da 3,8:1 sobre blanco, así que un chip lleva **texto en tinta y punto de color**, nunca texto rosado.

## Luces

| Utilidad | Qué hace | Dónde |
|---|---|---|
| `Aurora` (componente) | Tres brillos difusos fijos detrás de la página | Una vez por página, en el layout |
| `glass-wash` | Dos luces iridiscentes tenues dentro de la pieza (arriba a la izquierda y abajo a la derecha) | Todas las tarjetas y paneles (ya incluida en `Card` y `GlassPanel`) |
| `glass-sheen` | Un reflejo de luz cruza la pieza al pasar el mouse o enfocarla | Solo piezas que se pueden tocar (`Card interactive`) |
| `text-iridescent` | Texto en degradado índigo, lila y rosado | Una frase por vista, en tamaño `heading` o mayor |

## Tipografía

Una sola familia: **Helvetica Neue** en dispositivos Apple (la de la referencia; es de pago y no se distribuye, pero viene instalada) e **Inter** en el resto. Geist Mono para datos tabulares.

| Rol | Tamaño | Alto de línea | Tracking | Peso |
|---|---|---|---|---|
| `display` | 48 px | 1.05 | -0.03em | 400 |
| `heading` | 32 px | 1.15 | -0.02em | 400 |
| `heading-sm` | 24 px | 1.25 | -0.015em | 400 |
| `subheading` | 18 px | 1.35 | -0.01em | 500 |
| `body` | 16 px | 1.5 | -0.005em | 400 |
| `body-sm` | 14 px | 1.45 | 0 | 400 o 500 |
| `caption` | 12 px | 1.35 | 0.005em | 500 |

La jerarquía la da el tamaño, no el peso: los títulos van en 400. Los campos usan `body` (16 px) para que iOS no haga zoom.

## Tamaños

| Pieza | Medida |
|---|---|
| Botón, campo, selector, ítem de navegación | alto 44 px |
| Botón de ícono | círculo de 44 px |
| Ícono | 20 px (`size-icon`) en botones de ícono y navegación; 18 px (`size-icon-sm`) dentro de un botón con texto; trazo 1.5; Lucide |
| Chip | texto `caption`, padding 4 × 10 px, punto de 6 px, separación 6 px; alto 24 px |
| Tarjeta | padding 24 px, radio 20 px, separación interna 8 px |
| Panel de vidrio | padding 24 px, radio 28 px |
| Campo | radio 14 px, padding horizontal 16 px |
| Listas | 12 px entre tarjetas; 48 px entre secciones |

Espaciado base 4 px: 4, 8, 12, 16, 20, 24, 32, 40, 48, 64, 80, más los tokens de componente (`chip-x`, `chip-y`, `chip-gap`, `dot`, `icon`, `icon-sm`, `panel`, `nav-bottom`, `nav-top`). `theme.css` elimina todo lo demás.

## Componentes

| Componente | Forma |
|---|---|
| `Button` | Pastilla. `primary` negro sólido (uno por vista), `secondary` de vidrio, `accent` índigo, `ghost` sin relleno. `block` ocupa el ancho. |
| `IconButton` | Círculo de 44 px de vidrio con `glass-wash`: `surface`, `urgent` y `pending` (vidrio teñido del estado), `solid` (negro), `ghost`. Siempre con `label`. |
| `Chip` | Pastilla de vidrio teñido con `glass-wash`, punto que brilla con su color y texto en tinta. `urgent`, `pending`, `done`, `closed`, `neutral`. |
| `ButtonGroup` | Tres o más acciones relacionadas en fila van en **una sola pastilla de vidrio**, nunca como botones sueltos. Adentro, botones `ghost`; como mucho uno `primary`/`solid` marca la acción principal. |
| `SegmentedControl` | Vistas excluyentes: la elegida en negro, las demás en `surface-muted`. |
| `Card` | Blanca con `glass-wash`, radio 20, sombra suave. `selected` pasa a `accent-tint`; `interactive` se eleva y atrapa la luz al pasar el mouse. |
| `GlassPanel` | Vidrio con `glass-wash`, para paneles sobre el mapa y hojas inferiores. |
| `FloatingNav` | Pastilla de vidrio flotante, la única barra de navegación. Celular: abajo, solo íconos. Tablet y escritorio: arriba, ícono y texto. Ítem activo en negro. Va fuera de `<main>` y la página le deja espacio con `pb-nav-bottom md:pt-nav-top`. |
| `Aurora` | Fondo ambiental. |
| `Field` + `Input` | Etiqueta, campo relleno sin línea, ayuda o error. Al enfocarlo pasa a blanco con un halo suave de color `accent`, sin contorno. Error: relleno `status-urgent-tint` y texto `status-urgent-text`. |
| `Skeleton`, `Spinner` | Ver Carga. |

## Movimiento

Solo existen estos tokens; ningún componente inventa su duración.

| Token | Valor | Uso |
|---|---|---|
| Transición por defecto | 150 ms, `ease-standard` | Hover, cambio de estado, selección |
| `animate-enter` | 250 ms, aparece subiendo 8 px | Una vista al terminar de cargar; un panel al abrirse |
| `glass-sheen` | 700 ms | Reflejo al pasar el mouse |
| `animate-shimmer` | 1,4 s en bucle | Solo `Skeleton` |
| `animate-spin` | 0,8 s en bucle | Solo `Spinner` |
| `ease-standard` / `ease-exit` | `cubic-bezier(0.2, 0, 0, 1)` / `cubic-bezier(0.3, 0, 1, 1)` | Entrar / salir |

Con `prefers-reduced-motion`, todo movimiento se apaga.

## Carga

**Una vista aparece entera de una vez.** Nunca una lista a los 2 segundos y otra parte de la misma pantalla a los 10.

- Cada ruta tiene **un solo `loading.tsx`**, hecho solo con `Skeleton` en la forma exacta de la vista final. Nada salta cuando llega el contenido.
- Los datos de una vista se piden **en paralelo y en un solo lugar** (`Promise.all` en la página, o una función de `queries.ts` que trae todo), nunca en cascada componente por componente.
- Sin `Suspense` anidados dentro de una vista. La única excepción es lo que carga fuera del flujo de la página (el script del mapa), con su propio skeleton del mismo tamaño.
- Cuando todo llegó, la vista entra con `animate-enter`.
- `Spinner` es para una acción en curso (un botón guardando), nunca para cargar una página.

## Temas

Claro, oscuro y automático (sigue al sistema; es el valor por defecto). Cada token tiene valor en los dos temas y los componentes no saben en cuál están: `dark:` no se usa fuera de `shared/ui`. Un script en el `<head>` aplica la elección explícita antes del primer pintado, así no hay parpadeo. El mapa toma el tema con `colorScheme` en su próxima carga (ADR 0006).

## Dispositivos

| Rango | Desde | Layout |
|---|---|---|
| Celular | 0 | Una columna. Mapa a pantalla completa, detalle en `GlassPanel` abajo, `FloatingNav` abajo. |
| Tablet | 768 px (`md`) | Horizontal (`landscape:`): lista a un lado y mapa al otro. Vertical (`portrait:`): el panel pasa a hoja inferior. |
| Escritorio | 1280 px (`xl`) | Lista, mapa y detalle flotante a la vez. |

Se revisa a 375, 768, 1024 y 1440 px, en los dos temas. Objetivos táctiles de 44 px, nada que exista solo con hover, áreas seguras respetadas (`viewportFit: "cover"`).

## No hagas

- Bordes o contornos para separar o decorar; dos colores en una pieza.
- Texto rosado chico; un estado dicho solo con color.
- Más de una frase iridiscente por vista, o luces en piezas que no son tarjetas ni paneles.
- Valores fuera de la escala; sombras, radios o duraciones inventadas.
- Spinners para cargar páginas; partes de una vista que llegan a destiempo.
- Emojis, fotos de archivo, ilustraciones 3D.

## Para un agente que diseña una pantalla

1. Lee este archivo y abre `/es/dev/ui`.
2. Arma la pantalla solo con piezas de `src/shared/ui`. Si falta una, agrégala ahí primero, con sus variantes.
3. Tokens por nombre (`bg-surface-muted`, `text-ink-soft`, `rounded-card`), nunca un valor.
4. Escribe su `loading.tsx` con `Skeleton` antes que la vista.
5. Revísala a 375, 768, 1024 y 1440 px, en claro y oscuro.
