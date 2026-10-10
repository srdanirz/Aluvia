# 0004 · Design system: shadcn/ui sobre Tailwind v4, cerrado

- **Estado:** aceptada
- **Fecha:** 2026-10-09

## Contexto

Dos personas, y después contribuidores externos, van a construir pantallas en paralelo y con prisa. Sin un sistema cerrado, cada PR trae su propio botón, su propia tabla y su `!important`, y en una semana la UI ya no es consistente. Crisis Cleanup, el referente más cercano, tuvo que hacer una migración entera para sacar 20 colores hex sueltos y llevarlos a tokens.

## Decisión

- **Primitivas:** shadcn/ui, copiadas a `src/shared/ui/` (el código queda en el repo y es nuestro). Accesibilidad de Radix incluida.
- **Lenguaje visual:** [DESIGN.md](../DESIGN.md), adaptado del estilo de General Intelligence Company (análisis de Refero).
- **Tokens:** Tailwind v4 con `@theme` en `src/shared/ui/theme.css`, que resetea los defaults de Tailwind. Es la única fuente de color, espaciado, radio, sombra y tipografía.
- **Temas claro, oscuro y automático** como parte del sistema: cada token tiene valor en los dos temas y los componentes no usan `dark:`.
- **Responsive de fábrica:** cada primitiva funciona en celular, tablet (iPad) y escritorio.
- **Variantes con `cva`.** Una forma visual nueva es una variante de la primitiva, nunca un `className` que la sobrescribe desde una feature.
- **Componentes de dominio compartidos** también viven en `shared/ui/`: `StatusBadge`, `DataTable`, `MapPin`, `EmptyState`.
- **Cerrado por lint:** fuera de `src/shared/ui/` están prohibidos los elementos HTML interactivos crudos, el prop `style`, los valores arbitrarios de Tailwind, `!important` y las clases que no salen de los tokens. El detalle de las reglas está en `docs/STYLEGUIDE.md`.

## Consecuencias

- Agregar una pieza visual nueva cuesta un PR a `shared/ui/` antes del PR de la feature. Ese costo es el objetivo: obliga a pensar si la pieza ya existe.
- Una página de catálogo (`/dev/ui`) muestra todas las primitivas con sus variantes, para revisar consistencia sin navegar la app.
