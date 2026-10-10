<!--
Título: Conventional Commit en inglés, igual al commit del squash.
  feat(work-items): claim a work item from the map
Un PR hace una sola cosa. Si la descripción necesita un "y además", son dos PRs.
-->

## Qué cambia

<!-- Una o dos líneas, en lenguaje de producto: qué puede hacer alguien ahora que antes no. -->

Closes #

## Por qué

<!-- El problema o la decisión. Si hay un ADR, enlázalo. -->

## Cómo probarlo

<!-- Pasos que el revisor puede seguir tal cual, con datos inventados. -->

1.
2.

## Evidencia

<!--
Pega el output de los comandos que corriste, no "funciona".
UI: capturas a 375 y 1024 px en tema claro y oscuro como muestra; la prueba se hace en los cuatro anchos del checklist.
Listado nuevo: el EXPLAIN ANALYZE.
-->

## Riesgos y lo que queda fuera

<!-- Qué podría romperse, qué decidiste no hacer en este PR y dónde queda anotado. "Ninguno" es válido. -->

## Checklist

**Siempre**
- [ ] Rama rebasada sobre `main` y checks en verde
- [ ] Sin secretos ni datos personales reales (SECURITY.md)
- [ ] Probado localmente; la evidencia está arriba
- [ ] CODE_MAP, STYLEGUIDE, AI_PITFALLS o un ADR actualizados si corresponde

**Si toca datos**
- [ ] Sin N+1: listados nuevos con test de conteo de consultas
- [ ] Sin race conditions: lo concurrente se decide en la base, con test de concurrencia
- [ ] Migración generada con `drizzle-kit generate`, aditiva, con sus índices

**Si toca UI**
- [ ] Solo primitivas de `src/shared/ui/` (sin `style`, valores arbitrarios, `dark:` ni `!important`)
- [ ] Probado a 375, 768, 1024 y 1440 px, en tema claro y oscuro
- [ ] Textos por next-intl en todos los idiomas, en español neutro

**Si es una feature nueva**
- [ ] Métricas, eventos del catálogo y alerta si su falla deja a alguien sin ayuda
- [ ] Notificaciones por el outbox, si avisa algo
