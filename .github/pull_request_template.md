## Qué cambia

<!-- Una o dos líneas. Enlaza el issue: Closes #N -->

## Por qué

## Cómo probarlo

1.

## Checklist

- [ ] Sin secretos ni datos personales reales (ver SECURITY.md)
- [ ] Sin N+1: los listados nuevos traen test de conteo de consultas y `EXPLAIN ANALYZE`
- [ ] Sin race conditions: lo que dos personas pueden tocar a la vez se decide en la base, con test de concurrencia
- [ ] UI solo con primitivas de `src/shared/ui/` (sin `style`, valores arbitrarios ni `!important`)
- [ ] Observabilidad: métricas, eventos del catálogo y alerta si corresponde, sin datos personales
- [ ] Probado a 375, 768, 1024 y 1440 px, en tema claro y oscuro
- [ ] Textos de usuario por next-intl, en español neutro
- [ ] Probado localmente; pego el output o captura si aplica
- [ ] Si es una decisión de largo plazo, agregué un ADR en `docs/adr/`
