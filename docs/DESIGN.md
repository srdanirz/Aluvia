# DESIGN

Lenguaje visual de Aluvia. Es la referencia que se lee **antes de diseñar o construir cualquier pantalla**, y la especificación de los tokens. La implementación es `src/shared/ui/theme.css`: si los dos difieren, manda `theme.css` y este archivo se corrige en el mismo PR. Las reglas de uso del design system (qué se puede y qué no fuera de `shared/ui/`) están en [ADR 0004](adr/0004-design-system.md) y en el [STYLEGUIDE](STYLEGUIDE.md).

## Referencia

El estilo parte del sitio de [General Intelligence Company](https://www.generalintelligencecompany.com/), según el análisis de Refero ([ficha del estilo](https://styles.refero.design/style/34baa524-5d5b-4165-bbab-d01f05e6d6b9)): lienzo cálido casi blanco, tinta casi negra, bordes finos, una serif editorial para títulos, una sans sobria para todo lo demás y un solo acento azul usado con moderación.

Tomamos el **sistema** (paleta, tipografía, espaciado, radios, sombras), no la marca: sus fuentes son comerciales y sus ilustraciones pintadas son propias, así que no se usan.

## Adaptaciones para Aluvia

La referencia es un sitio editorial para leer con calma. Aluvia se usa en la calle, con sol, desde un celular y con prisa. Por eso cambian cuatro cosas, y estas mandan sobre la referencia:

1. **Contraste AA siempre.** El Signal Blue (`#41a1cf`) da 2,9:1 sobre el lienzo y no sirve para texto ni para bordes de controles. Texto y links azules usan `#006a9e` (5,9:1); bordes azules, `#0081c0`.
2. **La acción principal es el botón oscuro relleno** (Dusk, 16:1), no el contorno azul. El contorno queda para acciones secundarias.
3. **Colores de estado.** La referencia prohíbe acentos nuevos; Aluvia necesita distinguir urgente, en curso y hecho. Se agregan cuatro tokens de estado, que solo usan `StatusBadge` y los pines del mapa.
4. **Densidad.** En el panel del coordinador se usa la escala compacta; el aire generoso de la referencia queda para las pantallas públicas.

## Tokens

### Color

| Token | Hex | Uso |
|---|---|---|
| `canvas` | `#fefffc` | Fondo de página. Nunca `#ffffff` como lienzo. |
| `surface` | `#ffffff` | Tarjetas, paneles, hojas inferiores. |
| `surface-muted` | `#f9faf7` | Inputs, franjas de sección, fila seleccionada. |
| `ink` | `#171717` | Texto principal. Nunca `#000000`. |
| `ink-strong` | `#2c2c2c` | Títulos. |
| `ink-soft` | `#444141` | Texto secundario, etiquetas. |
| `ink-muted` | `#646464` | Ayudas, metadatos. Mínimo para texto. |
| `line` | `#dee2de` | Bordes de tarjetas, divisores. |
| `line-strong` | `#b4b8b4` | Bordes deshabilitados. Nunca para texto (2:1). |
| `action` | `#1f1f29` | Fondo del botón principal. |
| `action-line` | `#282834` | Borde de botones secundarios, íconos. |
| `accent` | `#006a9e` | Links y texto de acento. |
| `accent-line` | `#0081c0` | Borde de la acción destacada, foco. |
| `status-urgent` | `#b42318` | Sin atender, grave. |
| `status-pending` | `#b54708` | Tomado, en curso. |
| `status-done` | `#067647` | Hecho. |
| `status-closed` | `#646464` | Cerrado sin hacer: duplicado, no quiere ayuda. |

### Tipografía

| Familia | Fuente | Licencia | Uso |
|---|---|---|---|
| `font-display` | Fraunces, peso 400 | OFL (Google Fonts) | Títulos de 27 px o más. Nunca peso 600+. |
| `font-sans` | Inter, pesos 400 a 600 | OFL (Google Fonts) | Todo lo demás: UI, cuerpo, botones, tablas. |

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

## Componentes

- **Botón principal:** fondo `action`, texto blanco, radio 8 px, alto mínimo 44 px, sans 500 15 px.
- **Botón secundario:** transparente, borde 1 px `action-line`, texto `action-line`.
- **Botón destacado:** transparente, borde 1 px `accent-line`, texto `accent`, con flecha a la derecha. Uno por pantalla como máximo.
- **Link:** texto `accent` o `ink-soft`, sin subrayado hasta el hover, flecha opcional.
- **Input:** fondo `surface-muted`, solo borde inferior `ink-soft`, radio 0, estética de formulario en papel. Foco: borde inferior de 2 px `accent-line`. Alto mínimo 44 px.
- **Tarjeta:** `surface`, borde `line`, radio 12 px, `shadow-card`, padding 16 px.
- **Navegación:** una pastilla flotante centrada (radio `full`, fondo blanco translúcido con `backdrop-blur`, borde `action-line`). Sin barra lateral en las vistas públicas.
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
- Acentos de color nuevos fuera de los tokens de estado.
- Serif en peso 600+ o en textos menores a 27 px.
- Transparencia en el texto de cuerpo.
- Fotos de archivo, ilustraciones 3D, emojis.

## Para un agente que diseña una pantalla

1. Lee este archivo y revisa qué hay en `src/shared/ui/` (y en `/dev/ui` si la app está corriendo).
2. Arma la pantalla **solo** con primitivas existentes. Si falta una, propón primero el cambio a `shared/ui/` con sus variantes.
3. Usa tokens por nombre (`bg-canvas`, `text-ink-soft`, `border-line`, `rounded-card`), nunca un valor.
4. Revisa la pantalla a 375 px de ancho antes de darla por terminada.
