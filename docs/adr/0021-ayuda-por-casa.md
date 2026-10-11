# 0021 · Se ayuda por casa, no por trabajo

- **Estado:** aceptada
- **Fecha:** 2026-10-11

## Contexto

La ficha de una casa mostraba "Voy para allá" y "Actualizar estado" en cada trabajo (sacar barro, sacar agua, mano de obra). Quien va a una casa va a toda la casa: tres botones iguales confunden, y en terreno lo que se hace cambia minuto a minuto dentro de la misma casa.

## Decisión

- **El modelo no cambia:** cada casa sigue teniendo sus `work_items` (Crisis Cleanup), con su estado, su reserva y su historial.
- **Las acciones del voluntario son por casa:** "Voy para allá" toma de una vez todos los trabajos libres de la casa; Llegué, Sigo en camino, Ya no voy y los cierres actúan sobre todos los que la persona tiene ahí. Es una sola sentencia por acción (`claimWorkItem` y compañía con `{ worksiteId }`).
- **"Actualizar estado" (cualquiera, ADR 0018) es por casa:** cambia todos los trabajos abiertos que nadie de ahí tiene, todo o nada: si uno cambió desde que se mostró, no cambia ninguno (`stale_version`).
- **El coordinador sigue por trabajo:** verificar, marcar duplicado y deshacer, porque revisa caso a caso.

## Consecuencias

- Dos voluntarios que tocan la misma casa a la vez: uno se queda con todos los trabajos libres y el otro ve "ya tomado".
- Un trabajo que otro voluntario ya tenía se respeta; "Voy para allá" toma solo el resto.
