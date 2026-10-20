# DESIGN

Lenguaje visual de Aluvia. Se lee **antes de diseñar o construir cualquier pantalla**. Es la especificación; la implementación es `src/shared/ui/theme.css`, y si difieren manda `theme.css` y este archivo se corrige en el mismo PR. Reglas de uso fuera de `shared/ui/`: [ADR 0004](adr/0004-design-system.md) y [STYLEGUIDE](STYLEGUIDE.md). Catálogo vivo: `/es/dev/ui`.

## Primero: sin fricción

**Usar Aluvia tiene que ser más fácil que subir una historia de Instagram.** Si no, la gente sigue con las historias y la app no sirve. Cada pantalla se mide contra eso:

| Regla | Medida |
|---|---|
| Reportar una casa | Menos de 30 segundos y 3 toques: ubicación (GPS ya puesto), qué necesita (tocar íconos, no escribir), enviar |
| Cuenta | Nadie crea cuenta para reportar ni para mirar el mapa. Tomar un trabajo pide solo nombre y teléfono, una vez |
| Link | Un link compartido por WhatsApp abre directo la casa o la zona, sin pasos previos |
| Escribir | Opcional siempre. Todo lo obligatorio se elige con un toque |
| Una cosa por pantalla | Una acción principal; lo demás, escondido hasta que se pida |
| Errores | Nunca se pierde lo que alguien ingresó: se guarda en el teléfono hasta que llega |

Si una pantalla necesita explicarse, está mal diseñada.

## Dirección

Paneles de vidrio sobre un fondo luminoso, luces iridiscentes, piezas en forma de pastilla y colores sólidos. Referencias: interfaces de seguimiento con mapa (lista de tarjetas a un lado, mapa al otro, detalle flotando abajo) y el brillo ambiental de Apple Intelligence.

**Reglas que no se discuten:**

1. **Sin bordes.** Una pieza se separa con espacio, con otro tono de superficie o con sombra, nunca con una línea. El lint rechaza `border`, `outline`, `ring` y `divide` fuera de `shared/ui`. La única línea es el anillo de foco cuando se navega con teclado en botones y enlaces (accesibilidad); los campos muestran el foco aclarando el vidrio y elevándose, nunca con un anillo o una luz de color.
2. **Un color por pieza.** Un botón es un relleno sólido (o un degradado), nunca un relleno de un color con un borde de otro.
3. **Pastillas.** Botones, chips, selectores y navegación son `rounded-full`. Tarjetas y paneles, radios grandes. Tres o más acciones en fila se unen en una pastilla larga (`ButtonGroup`).
4. **Luz, no líneas.** La profundidad la dan el vidrio, las luces iridiscentes (`glass-wash`) y la sombra.
5. **Carga uniforme.** Una vista aparece entera de una vez (ver Carga).

## Color

Marca: **negro y blanco** para las acciones, y tres familias del territorio, propuestas por Santiago (PR #7): **lluvia** (información, en curso, acento), **tierra** (casas y terreno, lo que necesita ayuda) y **musgo** (comunidad, lo hecho). Calma en vez de alarma: es una herramienta de vecinos en una catástrofe.

| Token | Claro | Oscuro | Uso |
|---|---|---|---|
| `canvas` | `#F5F6FB` | `#0B0C12` | Fondo de página, bajo la aurora. |
| `scrim` | `#0B0C12` | `#0B0C12` | Detrás de una foto abierta entera: oscuro en los dos temas. |
| `surface` | `#FFFFFF` | `#16171F` | Tarjetas. |
| `surface-muted` | `#E9EBF5` | `#1E2029` | Fondos de bloque dentro de una tarjeta; skeletons. |
| `ink` | `#0A0B10` | `#F2F3F8` | Texto principal y texto de chips. |
| `ink-soft` | `#3D3F52` | `#C3C6D6` | Texto secundario. |
| `ink-muted` | `#62657A` | `#9A9DB2` | Ayudas y metadatos. Mínimo para texto. |
| `action` / `on-action` | `#000000` / `#FFFFFF` | `#FFFFFF` / `#000000` | Botón principal, ítem activo. |
| `accent` / `on-accent` | `#3C6880` / `#FFFFFF` | `#9CC4D9` / `#0B0C12` | Acción destacada, foco, links. Es `rain-600`. |
| `accent-tint` | `#E9F1F5` | `#172129` | Tarjeta seleccionada. Es `rain-100`. |
| `status-urgent` / `-tint` | `#C8372D` / `#FBE9E7` | `#F27A6F` / `#2C1614` | Sin atender o no entrar: rojo de semáforo. |
| `status-urgent-text` | `#A42A22` | `#F27A6F` | Texto de error. |
| `status-pending` / `-tint` | `#C96A0A` / `#FDF0E2` | `#F4A650` / `#2B1E10` | Tomado, en curso: naranjo. |
| `status-done` / `-tint` | `#2F7D3B` / `#E5F2E7` | `#74C483` / `#142519` | Atendida: verde. |
| `status-closed` / `-tint` | `#8B8EA3` / `#EEF0F5` | `#9A9DB2` / `#23252F` | Cerrado sin hacer. |
| `glass` | blanco al 62 % | `#16171F` al 60 % | Relleno de lo que flota. |
| `glass-hover` | blanco al 75 % | blanco al 8 % | Hover de piezas discretas o translúcidas: un vidrio más claro, nunca un gris sólido. |
| `aurora-1/2/3` | `#BCD3DF`, `#DFC9AD`, `#C4D3B9` | `#2B4252`, `#4B3D2E`, `#384733` | Fondo ambiental y luces: lluvia, tierra y musgo. |

Contraste medido: todo texto cumple AA (4,5:1) sobre `canvas` y `surface` en los dos temas; los `-600` dan 5:1 o más. Un chip lleva **texto en tinta y punto de color**: el color refuerza, el texto dice. `status-pending` (naranjo) da 3,8:1 en claro: sirve para puntos, íconos y bordes de forma (3:1), nunca para texto.

**Familias ambientales** (`rain-`, `earth-`, `moss-` en 100, 300 y 600): franjas, estados vacíos, zonas del mapa, gráficos e ilustración. Una familia por bloque. Nunca para una acción.

## Luces

| Utilidad | Qué hace | Dónde |
|---|---|---|
| `Aurora` (componente) | Tres brillos difusos fijos detrás de la página | Una vez por página, en el layout |
| `glass-wash` | Dos luces iridiscentes tenues dentro de la pieza (arriba a la izquierda y abajo a la derecha) | Todas las tarjetas y paneles (ya incluida en `Card` y `GlassPanel`) |
| `glass-sheen` | Un reflejo de luz cruza la pieza al pasar el mouse o enfocarla | Solo piezas que se pueden tocar (`Card interactive`) |
| `text-iridescent` | Texto en degradado lluvia, musgo y tierra | Una frase por vista, en tamaño `heading` o mayor |

## Marca

| Archivo | Qué es | Uso |
|---|---|---|
| `docs/brand/aluvia-logo.svg` / `-inverse` | Figura con pala y "aluvia", tinta / `#FEFFFC` | Componente `Logo`, que muestra la versión del tema |
| `docs/brand/aluvia-mark.svg` / `-inverse` | Solo la figura | Favicon (`src/app/icon.svg`, que pasa a `#FEFFFC` cuando el navegador está en oscuro), ícono de la PWA, avatar |

El logotipo es Unbounded 700 convertido a trazos (nunca se reescribe con la fuente). Una sola tinta: sin color, sombra, borde ni contenedor. Mínimo: 24 px de alto la figura, 120 px de ancho el logo.

### Figura y movimiento

La figura del logo es también el sistema de ilustración: la misma persona en distintas tareas. Mismas reglas que el logo: la tinta de marca, cabeza redonda separada del cuerpo a la distancia del logo, tierra y barro en `earth-600`, sin caras ni otros colores.

| Archivo | Qué muestra | Formato |
|---|---|---|
| [`brand/figura/aluvia-saludo.png`](brand/figura/aluvia-saludo.png) | De frente, saludando | PNG 2048 px, fondo transparente |
| [`brand/figura/aluvia-carretilla.png`](brand/figura/aluvia-carretilla.png) | Llevando una carretilla con tierra | PNG 2048 px, fondo transparente |
| [`brand/figura/aluvia-baldes.png`](brand/figura/aluvia-baldes.png) | Llevando dos baldes con barro | PNG 2048 px, fondo transparente |
| [`brand/motion/aluvia-logo-cavando.mp4`](brand/motion/aluvia-logo-cavando.mp4) | La figura cava, cae tierra y entra el logotipo | 1080 x 1920, 9,5 s |
| [`brand/motion/aluvia-saludo.mp4`](brand/motion/aluvia-saludo.mp4) | Saludo en loop | 1080 x 1080, 3 loops |
| [`brand/motion/aluvia-carretilla.mp4`](brand/motion/aluvia-carretilla.mp4) | Caminata con carretilla en loop | 1080 x 1080, 3 loops |
| [`brand/motion/aluvia-baldes.mp4`](brand/motion/aluvia-baldes.mp4) | Caminata con baldes en loop | 1080 x 1080, 3 loops |

- El movimiento va "a dos": 15 dibujos por segundo con un leve temblor del contorno, como tinta dibujada a mano. La cabeza no tiembla ni cambia de distancia.
- Los videos no tienen audio. Las versiones con fondo transparente (ProRes 4444) quedan fuera del repositorio por peso; se piden a los mantenedores.
- Son piezas de comunicación, no de la app: dentro de la UI no hay ilustraciones (estados vacíos con una frase y una acción).

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
| `Button` | Pastilla. `primary` negro sólido (uno por vista), `secondary` de vidrio, `accent` lluvia, `ghost` sin relleno. `block` ocupa el ancho. |
| `IconButton` | Círculo de 44 px de vidrio con `glass-wash`: `surface`, `urgent` y `pending` (vidrio teñido del estado), `solid` (negro), `ghost`. Siempre con `label`. |
| `Chip` | Pastilla de vidrio teñido con `glass-wash`, punto que brilla con su color y texto en tinta. `urgent`, `pending`, `done`, `closed`, `neutral`. `WorkStatusChip` y `CollectionPointStatusChip` deciden el tono de cada estado (centro de acopio: recibe en musgo, solo algunas en tierra, lleno en gris). |
| `MapMarker` | Pastilla sólida de 44 px con el ícono del estado. Tonos de semáforo para casas; `shape="sign"` (cuadrado de radio `control`) solo para "No entrar", así el peligro se distingue por la silueta además del ícono; `place` (tinta de marca) para lugares que no son casas, como un centro de acopio, así nunca se confunde con un estado. |
| `MediaGallery` | Fotos y videos en cuadros de radio `card`, dos columnas en celular y tres desde tablet. Una acción bajo cada cuadro (quitar, ocultar) y una marca opcional en la esquina; lo oculto se ve atenuado. |
| `ButtonGroup` | Tres o más acciones relacionadas en fila van en **una sola pastilla de vidrio**, nunca como botones sueltos. Adentro, botones `ghost`; como mucho uno `primary`/`solid` marca la acción principal. |
| `SegmentedControl` | Vistas excluyentes: la elegida en negro, las demás en `surface-muted`. |
| `Card` | Blanca con `glass-wash`, radio 20, sombra suave. `selected` pasa a `accent-tint`; `interactive` se eleva y atrapa la luz al pasar el mouse. |
| `GlassPanel` | Vidrio con `glass-wash`, para paneles sobre el mapa y hojas inferiores. |
| `FloatingNav` | Pastilla de vidrio flotante, la única barra de navegación. Celular: abajo, solo íconos. Tablet y escritorio: arriba, ícono y texto. Ítem activo en negro. Va fuera de `<main>` y la página le deja espacio con `pb-nav-bottom md:pt-nav-top`. |
| `Aurora` | Fondo ambiental. |
| `Field` + `Input` | Etiqueta, campo de vidrio esmerilado con brillo arriba, ayuda o error. Al enfocarlo el vidrio se aclara y se eleva con `shadow-float`; sin luz de color, halo ni anillo. Error: vidrio teñido de `status-urgent-tint` y texto `status-urgent-text`. |
| `Select`, `Textarea`, `FileButton` | Van dentro de `Field` como `Input`. `Select` es nativo (el teléfono abre su lista) con el mismo vidrio; `FileButton` se ve como `Button` secundario. |
| `FormError` | El único lugar que decide el color de un error: `field` bajo un campo, `form` para un formulario entero. El lint rechaza `text-status-*` fuera de `shared/ui`. |
| `TextLink` | Link dentro de un texto: color `accent` y subrayado, así no depende solo del color. Para un link solo, `Button` con `asChild`. |
| `Section`, `DescriptionList` | Bloque con título y bajada dentro de una vista; datos como etiqueta chica sobre valor, en dos columnas desde tablet. |
| `Skeleton`, `Spinner` | Ver Carga. `Skeleton` toma su forma con `shape`: `block`, `pill` o `card`. |

## Estados de una casa

El público ve **cuatro palabras**, no los seis niveles internos de [ADR 0011](adr/0011-mapa-nivel-de-atencion-y-agrupacion.md): un semáforo de tres colores y una marca de peligro aparte. La regla vive en `src/features/map/attention.ts` (`LEVEL_STATE`) y la dice siempre `HomeStateChip`; ningún archivo traduce un nivel a color por su cuenta.

| Estado | Tono | Ícono | Marcador | Niveles internos |
|---|---|---|---|---|
| Necesita ayuda | `urgent` (rojo) | mano que pide (`HandHelping`) | pastilla | sin atender, por confirmar, afectada sin pedido |
| Alguien va | `pending` (naranjo) | pasos (`Footprints`) | pastilla | en curso |
| Atendida | `done` (verde) | check | pastilla | atendida |
| No entrar | `urgent` (rojo) | señal de pare (`OctagonX`) | cuadrado (`sign`) | riesgo sin revisar |

- La información no se pierde: el nivel interno sigue ordenando el mapa, los grupos y Reportes, y la ficha de la casa explica en una línea los dos que no se ven en el estado ("por confirmar": nadie la actualiza hace tiempo; "afectada sin pedido": catastro oficial sin pedido).
- Cada estado se distingue sin color: ícono propio, nombre escrito y, para el peligro, otra silueta (#11).
- Ficha y tarjetas de Reportes muestran primero los datos con que se decide ir: dirección, estado, daño, qué necesita, cuántos voluntarios van, hace cuánto espera y la última novedad. Personas vulnerables solo para coordinadores; cuántas personas viven en la casa no se publica, porque delataría casas vacías (ADR 0011).

## Movimiento

Solo existen estos tokens; ningún componente inventa su duración.

| Token | Valor | Uso |
|---|---|---|
| Transición por defecto | 150 ms, `ease-standard` | Hover, cambio de estado, selección |
| `animate-enter` | 250 ms, aparece subiendo 8 px | Una vista al terminar de cargar; un panel al abrirse |
| `glass-sheen` | 700 ms | Reflejo al pasar el mouse |
| `animate-shimmer` | 1,4 s en bucle | Solo `Skeleton` |
| `animate-spin` | 0,8 s en bucle | Solo `Spinner` |
| `animate-dig`, `animate-nod`, `animate-dirt`, `animate-dirt-2`, `animate-dirt-3` | 1,4 s en bucle | Solo `LogoMark`: el cuerpo golpea con la pala, la cabeza lo acompaña y la tierra salta. Los terrones 2 y 3 salen 70 y 140 ms después del primero |
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
- Un estado dicho solo con color; lluvia, tierra o musgo para una acción.
- El logo con color, sombra o contenedor, o reescrito con la fuente.
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
