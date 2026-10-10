# 0004 · Design system: shadcn/ui sobre Tailwind v4, cerrado

- **Estado:** aceptada
- **Fecha:** 2026-10-09

## Contexto

Dos personas, y después contribuidores externos, van a construir pantallas en paralelo y con prisa. Sin un sistema cerrado, cada PR trae su propio botón, su propia tabla y su `!important`, y en una semana la UI ya no es consistente. Crisis Cleanup, el referente más cercano, tuvo que hacer una migración entera para sacar 20 colores hex sueltos y llevarlos a tokens.

## Decisión

- **Primitivas:** shadcn/ui, copiadas a `src/shared/ui/` (el código queda en el repo y es nuestro). Accesibilidad de Radix incluida.
- **Lenguaje visual:** [DESIGN.md](../DESIGN.md): pastillas, vidrio con luces iridiscentes, colores sólidos sin bordes, marca negro y blanco con las familias lluvia, tierra y musgo (PR #7). Reemplaza la primera versión, basada en General Intelligence Company, que se descartó antes de construir pantallas.
- **Tokens:** Tailwind v4 con `@theme` en `src/shared/ui/theme.css`, que resetea los defaults de Tailwind. Es la única fuente de color, espaciado, radio, sombra y tipografía.
- **Temas claro, oscuro y automático** como parte del sistema: cada token tiene valor en los dos temas y los componentes no usan `dark:`.
- **Responsive de fábrica:** cada primitiva funciona en celular, tablet (iPad) y escritorio.
- **Variantes con `cva`.** Una forma visual nueva es una variante de la primitiva, nunca un `className` que la sobrescribe desde una feature.
- **Componentes de dominio compartidos** también viven en `shared/ui/`: `Chip` (estados), y cuando se necesiten `DataTable`, `MapPin` y `EmptyState`.
- **Movimiento y carga son parte del sistema:** tokens de duración y curva, `Skeleton`, `Spinner` y la regla de carga uniforme de DESIGN.md.
- **Sin librería de componentes de vidrio.** Revisamos glasscn, Ein UI, Glin UI y Opaline: son proyectos jóvenes y una dependencia más para una app que tiene que durar. Tomamos sus patrones (vidrio, brillo, reflejo) y los escribimos como tokens y utilidades propias en `theme.css`.
- **Cerrado por lint:** fuera de `src/shared/ui/` están prohibidos los elementos HTML interactivos crudos, el prop `style`, los valores arbitrarios de Tailwind, `!important` y las clases que no salen de los tokens. El detalle de las reglas está en `docs/STYLEGUIDE.md`.

## Consecuencias

- Agregar una pieza visual nueva cuesta un PR a `shared/ui/` antes del PR de la feature. Ese costo es el objetivo: obliga a pensar si la pieza ya existe.
- Una página de catálogo (`/dev/ui`) muestra todas las primitivas con sus variantes, para revisar consistencia sin navegar la app.
