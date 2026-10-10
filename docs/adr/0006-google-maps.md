# 0006 · Mapa: Google Maps

- **Estado:** aceptada. Reemplaza a [0003](0003-mapa.md).
- **Fecha:** 2026-10-10

## Contexto

El mapa es la vista central de Aluvia. ADR 0003 había elegido MapLibre con teselas abiertas para evitar costos y API keys. El equipo prefiere Google Maps: es el mapa que los vecinos ya conocen, tiene mejor cobertura de calles y direcciones en Chile, y permite autocompletar direcciones.

## Decisión

- **Render:** Google Maps JavaScript API con `@vis.gl/react-google-maps`, el wrapper de React que mantiene el equipo de Google Maps Platform.
- **Pines:** Advanced Markers con un Map ID. El contenido del pin es un componente de `src/shared/ui/` (`MapPin`) con los tokens de estado de DESIGN.md.
- **Direcciones:** Place Autocomplete (New) (`PlaceAutocompleteElement`), siempre con session token: sin él, cada tecla se cobra como una consulta aparte. La sugerencia solo **mueve el mapa**; después el vecino pone o arrastra el pin y confirma "mi casa está aquí", o usa el GPS del celular.
- **Lo que se guarda:** la dirección tal como la escribió el vecino, el punto que él confirmó y, opcionalmente, el `place_id`. No se guardan la dirección formateada ni las coordenadas que devuelve Google.
- **Si el mapa no carga** (cuota agotada, Google caído, señal mala), la app sigue funcionando: vista de lista por zona y reporte con GPS o con la dirección escrita. El mapa mejora la app, pero no es un requisito para reportar ni para tomar trabajos.
- **Agrupación:** se mantiene en el servidor. El cliente pide por *bounding box* y PostGIS agrupa; nunca se mandan todas las casas al navegador.
- **Ubicación pública generalizada** en la base, igual que antes (STYLEGUIDE, Datos personales).

## Costos y controles

Desde marzo de 2025 cada SKU tiene su propio cupo gratis mensual (10.000 cargas de mapa dinámico, por ejemplo) y después se cobra por cada 1.000. Un link viral puede pasar ese cupo en horas, así que desde el primer deploy:

- **Alertas de presupuesto** en la cuenta de facturación de GCP.
- **Cuotas diarias** por API en la consola. Si un pico las agota, el mapa deja de cargar y la app pasa a la vista de lista (ver arriba), en vez de generar una cuenta sin techo. Las cuotas se revisan a diario mientras dure la emergencia.
- **API key restringida** por referrer HTTP (solo nuestros dominios, incluido `admin.<dominio>`) y solo a las APIs que usamos. La key del navegador es pública por diseño; la restricción es lo que la protege.
- Una sola carga del mapa por sesión: el mapa no se desmonta al navegar entre vistas.

## Términos de uso

- Los mapas, pines y sugerencias de Google se muestran sobre un mapa de Google o con la atribución de Google.
- Places solo permite guardar el `place_id` de forma indefinida; las coordenadas y direcciones de Google, como máximo 30 días. Por eso guardamos lo que aporta el vecino (texto y punto confirmado) y no lo que devuelve Google.
- Las exportaciones (por ejemplo, para el municipio) no incluyen `place_id` ni otro dato derivado de Google.
- Esta es nuestra lectura de los términos, no una revisión legal.

## Consecuencias

- **Se renuncia a la razón principal de ADR 0003:** cada fork necesita su propia API key, Map ID y una cuenta de facturación de GCP con tarjeta, aunque se quede dentro del cupo gratis. La guía de despliegue (por escribir con el scaffold) lo explica.
- Las variables `NEXT_PUBLIC_*` se fijan al compilar: si falta la key o el Map ID, el build falla con un mensaje claro.
- El costo deja de ser cero cuando se pasa el cupo gratis. Las cuotas lo acotan, a cambio de que el mapa se apague en el peor caso.

## Referencias

- [Google Maps Platform: cambios de precios 2025](https://developers.google.com/maps/billing-and-pricing/faq)
- [Términos específicos de Google Maps Platform](https://cloud.google.com/maps-platform/terms/maps-service-terms)
- [`@vis.gl/react-google-maps`](https://visgl.github.io/react-google-maps/)
