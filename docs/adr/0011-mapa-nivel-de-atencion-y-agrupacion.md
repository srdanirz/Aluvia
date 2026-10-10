# 0011 · Mapa: nivel de atención, agrupación y punto exacto

- **Estado:** aceptada
- **Fecha:** 2026-10-10

## Contexto

El mapa (ADR 0006) muestra cada casa con un color según cuánta ayuda tiene (#8), agrupa las que se solapan (#9) y no puede depender solo del color (#11). El servidor agrupa por *bounding box* (STYLEGUIDE). Faltaba fijar la fórmula del nivel, cómo se agrupa y qué ubicación se publica.

## Decisión

### Nivel de atención

Se calcula desde `work_items` en cada lectura; no se guarda. En orden de urgencia:

| Nivel | Regla | Tono | Ícono |
|---|---|---|---|
| Sin atender | Trabajos abiertos (`open_*`) sin nadie, o sin trabajos todavía, con actividad reciente | `urgent` (tierra) | triángulo de alerta |
| No entrar | Alguien reportó un riesgo (electricidad, gas, estructura) y ningún coordinador lo revisó: nadie puede tomar sus trabajos | `urgent` | señal de pare |
| Por confirmar | Igual que sin atender, pero sin actividad (`updated_at` de la casa o de sus trabajos) por más de `emergency_settings.stale_after_hours` (48 h por defecto) | `closed` | signo de pregunta |
| Afectada, sin pedido | Casa de un catastro oficial (`source = 'official'`, la carga el importador del admin) sin trabajos pedidos | `closed` | casa |
| En curso | Al menos un trabajo abierto con `claimed_by` | `pending` (lluvia) | pala |
| Atendida | Tiene trabajos y todos están cerrados (`closed_*`) | `done` (musgo) | check |

- El público no ve estos seis nombres: ve cuatro estados (Necesita ayuda, Alguien va, Atendida, No entrar) que los agrupan, definidos en DESIGN.md, "Estados de una casa". Seis colores y nombres no se distinguían en la calle. Los íconos de esta tabla son los del nivel interno; los del estado público están en DESIGN.md.
- "No entrar" va después de "Sin atender": una sola casa con riesgo no debe pintar un grupo entero como zona prohibida. La casa sola sí lo muestra.
- "Por confirmar" existe porque una casa ya limpia que nadie actualizó seguiría roja (docs/investigacion/04-casos-borde.md). No baja de urgencia a una casa con actividad reciente.
- Un grupo muestra su nivel más urgente; su etiqueta accesible dice cuántas casas hay de cada nivel.
- Cada nivel tiene ícono y nombre propios: se distingue sin color, con sol o con daltonismo (#11).
- Personas vulnerables **no** se muestran en el mapa público ni suben el nivel: marcar dónde viven personas vulnerables en un mapa abierto las expone. Lo ven los coordinadores.
- Personas e insumos faltantes (#15) todavía no suben el nivel: se suman a esta misma consulta, sin una segunda, cuando definamos cómo pesan.
- Una casa sin punto (solo dirección escrita) no aparece en el mapa; su ficha abre igual por link.

### Punto exacto público

El mapa y la ficha muestran el punto que confirmó quien reportó, y "Cómo llegar" lleva a la puerta. **Primero la experiencia:** un voluntario que llega a una cuadra inundada no puede adivinar cuál de veinte casas es. SECURITY.md pedía un punto aproximado para no exponer casas vacías a robos. Los mantenedores decidieron que la precisión pesa más y que el riesgo se acota así:

- Nunca se publica vulnerabilidad ni "casa sin gente". La dirección escrita es pública y el nombre y teléfono lo son si el vecino lo elige (ADR 0017).
- Los datos de contacto siguen en `worksite_contacts`, solo para coordinadores y con registro de cada vista.

### Agrupación

- Grilla de 0,001° (una cuadra). Celdas de agrupación de 2ⁿ celdas, de al menos unos 100 px en pantalla según el zoom (a 64 px los grupos se tapaban en un celular): anidan exacto al acercar.
- Un grupo se dibuja en el promedio de sus casas. Desde el zoom de calle (una celda por grupo) cada casa es su propio marcador en su punto.
- Una consulta por pedido: casas del bbox con su nivel, agrupadas por celda. Índice GiST `(emergency_id, location)` con `btree_gist`.
- Un grupo que ocupa varias celdas se abre acercando el mapa a sus límites. Uno dentro de una sola cuadra lista sus casas, las más urgentes primero, hasta 50.
- El pedido se rechaza (`422 bbox_too_large`) si a ese zoom el bbox tendría más de 2.500 celdas.
- Medido con 20.000 casas en una emergencia (`EXPLAIN ANALYZE`, base caliente): vista de calle 5 ms, todas las casas a la vista unos 120 ms.
- El mapa se refresca solo cada minuto y muestra la hora de la última lectura.

### Vista por zonas

Junto a "Casas", un modo "Zonas" pinta cada celda de agrupación con el color de su nivel más urgente, más oscura donde más casas esperan sin nadie, y dibuja el área oficial de la emergencia (`emergencies.area`). Es un mapa de calor hecho de celdas, que se lee de un vistazo en un celular. No usamos el HeatmapLayer de Google, que está deprecado.

### Ficha pública y cómo llegar

La ficha muestra nivel, daño, trabajos, cuándo se reportó y hace cuánto se actualizó. "Cómo llegar" abre Google Maps, Waze o Apple Maps con sus links universales al punto de la casa: sin key ni llamada a una API. Un slug o un id que no existe responde la página de 404 con `noindex`; como la ruta se transmite por partes (Cache Components), el status HTTP queda en 200.

### Sin key de Google Maps

La app compila y funciona sin `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` ni `NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID`. Sin mapa (sin key, key rechazada, o sin teselas a los 12 s: cuota agotada o sin red) se ve la misma información como lista por zonas, que se abren hasta llegar a cada casa. Esto corrige la consecuencia del ADR 0006 que pedía romper el build: un fork, el CI y el desarrollo local sin key quedaban bloqueados. Que producción tenga las dos variables lo verifica el despliegue (rama de infraestructura), no el build.

## Consecuencias

- Un cambio de estado de un trabajo se ve en el mapa en el siguiente pedido; las respuestas se cachean 10 s en el borde (`s-maxage`). Un slug que no existe responde `404 emergency_not_found`.
- La ficha pública (`/[locale]/emergencies/[slug]/worksites/[id]`) usa la misma forma pública: punto, nivel, daño y trabajos, nunca contacto, vulnerabilidad ni quién tomó qué.
- El admin edita `stale_after_hours` junto al resto de `emergency_settings`.
