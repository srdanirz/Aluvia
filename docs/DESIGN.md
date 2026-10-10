# DESIGN

Lenguaje visual de Aluvia. Es la referencia que se lee **antes de diseñar o construir cualquier pantalla**, y la especificación de los tokens. La implementación es `src/shared/ui/theme.css`: si los dos difieren, manda `theme.css` y este archivo se corrige en el mismo PR. Las reglas de uso del design system (qué se puede y qué no fuera de `shared/ui/`) están en [ADR 0004](adr/0004-design-system.md) y en el [STYLEGUIDE](STYLEGUIDE.md).

## Referencia

El estilo parte del sitio de [General Intelligence Company](https://www.generalintelligencecompany.com/), según el análisis de Refero ([ficha del estilo](https://styles.refero.design/style/34baa524-5d5b-4165-bbab-d01f05e6d6b9)): lienzo cálido casi blanco, tinta casi negra, bordes finos, una serif editorial para títulos, una sans sobria para todo lo demás y un solo acento azul usado con moderación.

Tomamos el **sistema** (paleta, tipografía, espaciado, radios, sombras), no la marca: sus fuentes son comerciales y sus ilustraciones pintadas son propias, así que no se usan.

## Adaptaciones para Aluvia

La referencia es un sitio editorial para leer con calma. Aluvia se usa en la calle, con sol, desde un celular y con prisa. Por eso cambian cinco cosas, y estas mandan sobre la referencia:

1. **Contraste AA siempre.** El Signal Blue (`#41a1cf`) da 2,9:1 sobre el lienzo y no sirve para texto ni para bordes de controles. Texto y links azules usan `#006a9e` (5,9:1); bordes azules, `#0081c0`.
2. **La acción principal es el botón oscuro relleno** (Dusk, 16:1), no el contorno azul. El contorno queda para acciones secundarias.
3. **Colores de estado.** La referencia prohíbe acentos nuevos; Aluvia necesita distinguir urgente, en curso y hecho. Se agregan cuatro tokens de estado, que solo usan `StatusBadge` y los pines del mapa.
4. **Densidad.** En el panel del coordinador se usa la escala compacta; el aire generoso de la referencia queda para las pantallas públicas.
5. **Paleta ambiental.** La referencia es casi monocroma. Aluvia suma tres familias suaves, lluvia, tierra y musgo, para que la plataforma se sienta del territorio y humana, no de alarma. Son fondos, zonas e ilustración: nunca acciones ni estados.

## Tokens

### Color

| Token | Claro | Oscuro | Uso |
|---|---|---|---|
| `canvas` | `#fefffc` | `#121214` | Fondo de página. En claro, nunca `#ffffff` como lienzo. |
| `surface` | `#ffffff` | `#1a1a1e` | Tarjetas, paneles, hojas inferiores. |
| `surface-muted` | `#f9faf7` | `#222227` | Inputs, franjas de sección, fila seleccionada. |
| `ink` | `#171717` | `#ececec` | Texto principal. Nunca `#000000`. |
| `ink-strong` | `#2c2c2c` | `#f5f5f3` | Títulos. |
| `ink-soft` | `#444141` | `#c4c4c0` | Texto secundario, etiquetas. |
| `ink-muted` | `#646464` | `#9a9a96` | Ayudas, metadatos. Mínimo para texto. |
| `line` | `#dee2de` | `#2e2e33` | Bordes de tarjetas, divisores. |
| `line-strong` | `#b4b8b4` | `#4a4a50` | Bordes deshabilitados. Nunca para texto (2:1). |
| `action` | `#1f1f29` | `#f5f5f3` | Fondo del botón principal. |
| `on-action` | `#ffffff` | `#1f1f29` | Texto e íconos sobre `action`. |
| `action-line` | `#282834` | `#d4d4d8` | Borde de botones secundarios, íconos. |
| `accent` | `#006a9e` | `#5cb8e6` | Links y texto de acento. |
| `accent-line` | `#0081c0` | `#41a1cf` | Borde de la acción destacada, foco. |
| `status-urgent` | `#b42318` | `#f97066` | Sin atender, grave. |
| `status-pending` | `#b54708` | `#fdb022` | Tomado, en curso. |
| `status-done` | `#067647` | `#47cd89` | Hecho. |
| `status-closed` | `#646464` | `#9a9a96` | Cerrado sin hacer: duplicado, no quiere ayuda. |

Todos los pares de texto cumplen AA (4,5:1) contra `canvas` y `surface` en los dos temas; `line-strong` es solo decorativo.

### Paleta ambiental: lluvia, tierra y musgo

| Token | Claro | Oscuro | Uso |
|---|---|---|---|
| `rain-100` | `#e9f1f5` | `#172129` | Fondo: franjas, estados vacíos, zonas informativas. |
| `rain-300` | `#bcd3df` | `#2b4252` | Relleno decorativo: zonas del mapa, gráficos, ilustración. |
| `rain-600` | `#3c6880` | `#9cc4d9` | Texto e íconos sobre `rain-100`, `canvas` y `surface`. |
| `earth-100` | `#f5ede3` | `#241e18` | Fondo cálido: franjas y tarjetas de contexto. |
| `earth-300` | `#dfc9ad` | `#4b3d2e` | Relleno decorativo: capas del terreno, gráficos. |
| `earth-600` | `#76563a` | `#d4b691` | Texto e íconos sobre `earth-100`, `canvas` y `surface`. |
| `moss-100` | `#ecf1e7` | `#1b2118` | Fondo: franjas de comunidad y voluntariado. |
| `moss-300` | `#c4d3b9` | `#384733` | Relleno decorativo y gráficos. |
| `moss-600` | `#4a6341` | `#aac39d` | Texto e íconos sobre `moss-100`, `canvas` y `surface`. |

- **Lluvia** para información y agua; **tierra** para el terreno, las casas y el trabajo físico; **musgo** para comunidad y voluntarios. Una familia por bloque, sin degradés entre ellas.
- Los `-100` son fondos; encima va texto `ink` o el `-600` de su familia. Los `-300` son solo decorativos: nunca texto ni borde de un control (1,6:1 contra el lienzo); encima va texto `ink`.
- Contraste medido en los dos temas: cada `-600` da 5,3:1 o más sobre su `-100`, `canvas` y `surface`; `ink` da 8,4:1 o más sobre cualquier `-100` o `-300`.
- No son acentos ni estados. Una acción sigue siendo `action` o `accent`; un estado sale de `StatusBadge`. Verde musgo no significa hecho.
- Las zonas del mapa se pintan con `rain-300` o `earth-300`, nunca con colores de estado.

### Tipografía

| Familia | Fuente | Licencia | Uso |
|---|---|---|---|
| `font-display` | Fraunces, peso 400 | OFL (Google Fonts) | Títulos de 27 px o más. Nunca peso 600+. |
| `font-sans` | Inter, pesos 400 a 600 | OFL (Google Fonts) | Todo lo demás: UI, cuerpo, botones, tablas. |
| `font-brand` | Unbounded, peso 700 | OFL (Google Fonts) | Solo el logotipo. Nunca en títulos ni en la UI. |

Se cargan con `next/font/google`, nunca desde un `<link>`.

| Rol | Tamaño | Alto de línea | Tracking | Familia |
|---|---|---|---|---|
| `display` | 54 px | 1.1 | -0.02em | display |
| `heading-lg` | 48 px | 1.1 | -0.02em | display |
| `heading` | 40 px | 1.1 | -0.02em | display |
| `heading-sm` | 27 px | 1.3 | -0.04em | display |
| `subheading` | 18 px | 1.3 | -0.01em | sans 500 |
| `body` | 16 px | 1.5 | -0.01em | sans 400 |
| `body-sm` | 15 px | 1.4 | -0.01em | sans 400 |
| `caption` | 13 px | 1.3 | -0.01em | sans 400 |

En celular, `display` y `heading-lg` bajan a `heading`. El texto de cuerpo nunca baja de 15 px.

### Espaciado, radios y sombras

- **Base 4 px.** Escala: 4, 8, 12, 16, 20, 24, 32, 40, 48, 64, 80. Ningún valor fuera de la escala.
- **Radios:** botones e inputs 8 px · tarjetas 12 px · paneles grandes y hojas 16 px · superficies destacadas 24 px · pastilla de navegación y chips `full`. Nada sobre 24 px salvo la pastilla.
- **Sombras:** `shadow-card` (`0 1px 1px rgb(0 0 0 / .08), 0 4px 5px rgb(0 0 0 / .08)`) para tarjetas; `shadow-float` (`0 2px 6px rgb(0 0 0 / .15)`) para lo que flota sobre el mapa. **Los botones no llevan sombra.**
- **Bordes:** 1 px `line` en tarjetas y secciones. Los bordes hacen el trabajo que en otros sistemas hacen las sombras.
- Ancho máximo de contenido: 1200 px.

## Marca

El logo es una persona cavando con una pala, en silueta de tinta con la cabeza separada del cuerpo: vecinos que ayudan con sus manos. El tono es sobrio, porque es una herramienta para una catástrofe: sin mascotas con cara, rebotes ni chistes visuales.

| Archivo | Contenido | Fondo |
|---|---|---|
| [`brand/aluvia-logo.svg`](brand/aluvia-logo.svg) | Figura y logotipo, tinta `#1f1f29` | `canvas`, `surface` y los `-100` |
| [`brand/aluvia-logo-inverse.svg`](brand/aluvia-logo-inverse.svg) | Figura y logotipo, `#fefffc` | `action`, tema oscuro, fotos oscuras |
| [`brand/aluvia-mark.svg`](brand/aluvia-mark.svg) | Solo la figura, tinta | Ícono de la PWA, avatar, favicon |
| [`brand/aluvia-mark-inverse.svg`](brand/aluvia-mark-inverse.svg) | Solo la figura, `#fefffc` | Ídem sobre fondo oscuro |

- El logotipo es "aluvia" en minúsculas, Unbounded 700, convertido a trazos: no se reescribe con la fuente.
- Siempre de una sola tinta. Sin color, sombra, borde ni contenedor; la cabeza no se acerca ni se aleja del cuerpo.
- Aire mínimo alrededor: el alto de la cabeza de la figura. Tamaño mínimo: 24 px de alto la figura sola, 120 px de ancho el logo completo.

### Figura y movimiento

La figura del logo es también el sistema de ilustración: la misma persona en distintas tareas. Mismas reglas que el logo: tinta `#1f1f29`, cabeza redonda separada del cuerpo a la distancia del logo, tierra y barro en `earth-600`, sin caras ni otros colores.

| Archivo | Qué muestra | Formato |
|---|---|---|
| [`brand/figura/aluvia-saludo.png`](brand/figura/aluvia-saludo.png) | De frente, saludando | PNG 2048 px, fondo transparente |
| [`brand/figura/aluvia-carretilla.png`](brand/figura/aluvia-carretilla.png) | Llevando una carretilla con tierra | PNG 2048 px, fondo transparente |
| [`brand/figura/aluvia-baldes.png`](brand/figura/aluvia-baldes.png) | Llevando dos baldes con barro | PNG 2048 px, fondo transparente |
| [`brand/motion/aluvia-logo-cavando.mp4`](brand/motion/aluvia-logo-cavando.mp4) | La figura cava, cae tierra y entra el logotipo | 1080 x 1920, 9,5 s |
| [`brand/motion/aluvia-cavando.mp4`](brand/motion/aluvia-cavando.mp4) | La figura cava en loop, sin texto | 1080 x 1080, 3 loops |
| [`brand/motion/aluvia-saludo.mp4`](brand/motion/aluvia-saludo.mp4) | Saludo en loop | 1080 x 1080, 3 loops |
| [`brand/motion/aluvia-carretilla.mp4`](brand/motion/aluvia-carretilla.mp4) | Caminata con carretilla en loop | 1080 x 1080, 3 loops |
| [`brand/motion/aluvia-baldes.mp4`](brand/motion/aluvia-baldes.mp4) | Caminata con baldes en loop | 1080 x 1080, 3 loops |

- El movimiento va "a dos": 15 dibujos por segundo con un leve temblor del contorno, como tinta dibujada a mano. La cabeza no tiembla ni cambia de distancia.
- Los videos no tienen audio. Las versiones con fondo transparente (ProRes 4444) quedan fuera del repositorio por peso; se piden a los mantenedores.
- Son piezas de comunicación, no de la app: dentro de la UI no hay ilustraciones (estados vacíos con una frase y una acción).

## Temas: claro, oscuro y automático

- Tres opciones para el usuario: **claro, oscuro y automático** (sigue al sistema operativo). Automático es el valor por defecto.
- Cada token tiene su valor en los dos temas, en `theme.css`. **Los componentes no saben en qué tema están**: usan `bg-surface` y el token cambia solo. Por eso el variante `dark:` no se usa fuera de `src/shared/ui/`.
- **Automático no necesita nada del servidor:** `theme.css` resuelve el tema con `@media (prefers-color-scheme: dark)`. La cookie solo existe si el usuario eligió claro u oscuro explícito; en ese caso el servidor pone `data-theme` en `<html>` desde el primer byte. Así no hay parpadeo en ningún caso.
- El mapa toma el tema con la prop `colorScheme` de `@vis.gl/react-google-maps`, que **solo se aplica al crear el mapa**. Cambiar de tema no remonta el mapa (sería otra carga cobrada, ADR 0006): el mapa toma el tema nuevo en la próxima carga. El Map ID necesita un estilo oscuro configurado en el estilo en la nube de Google.
- Las sombras en oscuro casi no se ven: ahí los bordes `line` hacen el trabajo.

## Dispositivos

Celular primero, pero tablet y escritorio son de primera clase: los coordinadores trabajan en iPad en terreno.

| Rango | Desde | Layout |
|---|---|---|
| Celular | 0 | Una columna. Mapa a pantalla completa con hoja inferior. Navegación inferior al alcance del pulgar. |
| Tablet | 768 px (`md`) | Horizontal (`landscape:`): mapa con panel lateral de 360 px. Vertical (`portrait:`): el panel pasa a hoja inferior. `md` solo mira el ancho y un iPad vertical ya mide 768 px o más, por eso manda la orientación. |
| Escritorio | 1280 px (`xl`) | Mapa, panel lateral y detalle de la casa a la vez. |

- Se prueba a **375, 768, 1024 (iPad vertical y horizontal) y 1440 px**.
- Todo se puede hacer con el dedo: objetivos de 44 px o más, sin acciones que solo existan con hover.
- Se respetan las áreas seguras del iPhone y del iPad (`env(safe-area-inset-*)`) en la barra inferior y en la hoja del mapa. Solo funcionan con `export const viewport = { viewportFit: "cover" }` en el layout raíz; sin eso valen 0.
- Los inputs usan el teclado correcto (`inputMode="tel"`, `type="email"`) y tienen 16 px o más, para que iOS no haga zoom al tocarlos.

## Componentes

- **Botón principal:** fondo `action`, texto `on-action`, radio 8 px, alto mínimo 44 px, sans 500 15 px.
- **Botón secundario:** transparente, borde 1 px `action-line`, texto `action-line`.
- **Botón destacado:** transparente, borde 1 px `accent-line`, texto `accent`, con flecha a la derecha. Uno por pantalla como máximo.
- **Link:** texto `accent` o `ink-soft`, sin subrayado hasta el hover, flecha opcional.
- **Input:** fondo `surface-muted`, solo borde inferior `ink-soft`, radio 0, estética de formulario en papel. Foco: borde inferior de 2 px `accent-line`. Alto mínimo 44 px.
- **Tarjeta:** `surface`, borde `line`, radio 12 px, `shadow-card`, padding 16 px.
- **Navegación:** una pastilla flotante centrada (radio `full`, fondo `surface` con opacidad y `backdrop-blur`, borde `action-line`). Sin barra lateral en las vistas públicas.
- **StatusBadge:** punto de color de estado + etiqueta escrita, sans 500 13 px. Nunca solo el color.
- **Mapa:** ocupa la pantalla completa en celular; los controles y la ficha de la casa flotan encima como hoja inferior (radio 16 px arriba, `shadow-float`).
- **Tablas (`DataTable`):** sin bordes verticales, divisores horizontales `line`, encabezado `caption` en `ink-muted`, fila seleccionada `surface-muted`.

## Haz

- Un solo título en serif por pantalla; todo lo demás en sans.
- Una idea por pantalla en las vistas públicas.
- Íconos Lucide de trazo 1.5, tamaño 16 o 20 px, del color del texto que acompañan.
- Estados vacíos con una frase y una acción, sin ilustración.

## No hagas

- Negro puro `#000000` ni blanco puro como lienzo.
- Botones con sombra, rellenos azules o en degradé.
- Colores nuevos fuera de los tokens: estado, paleta ambiental y los de la tabla de color.
- Serif en peso 600+ o en textos menores a 27 px.
- Transparencia en el texto de cuerpo.
- Fotos de archivo, ilustraciones 3D, emojis.
- Unbounded fuera del logotipo.
- Lluvia, tierra o musgo para una acción o un estado.
- El logo con color, sombra o contenedor.

## Para un agente que diseña una pantalla

1. Lee este archivo y revisa qué hay en `src/shared/ui/` (y en `/dev/ui` si la app está corriendo).
2. Arma la pantalla **solo** con primitivas existentes. Si falta una, propón primero el cambio a `shared/ui/` con sus variantes.
3. Usa tokens por nombre (`bg-canvas`, `text-ink-soft`, `border-line`, `rounded-card`), nunca un valor.
4. Revísala a 375, 768, 1024 y 1440 px, en tema claro y oscuro, antes de darla por terminada.
