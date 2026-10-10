# 0016 · Pedir ayuda con la dirección escrita, ubicada por el servidor

- **Estado:** aceptada
- **Fecha:** 2026-10-10

## Contexto

El 2026-10-10 entre 20:38 y 20:40 UTC entraron cinco reportes nuevos a producción (201, `aluvia.worksites.reports{outcome="created"}` = 5) y el mapa siguió vacío. El formulario aceptaba un reporte con solo la dirección escrita cuando el GPS no respondía o estaba denegado; esa casa se guardaba sin punto, y el mapa solo dibuja puntos. Nadie convertía la dirección en un punto, así que la casa existía pero no aparecía. El resumen del mapa sí las cuenta, pero con un caché de un minuto, y durante ese minuto también mostró "Aún no hay casas reportadas".

Además, quien pide ayuda muchas veces no está en la casa (la reporta un familiar o un vecino), y un GPS tomado en otro lugar pone el pin en la cuadra equivocada. La dirección escrita es lo que usan los voluntarios para llegar.

## Decisión

- **La dirección es obligatoria y es lo primero del formulario.** El formulario ya no pide el GPS. `worksiteReportSchema` exige `contact.addressText`; solo acepta un reporte sin dirección si trae un punto, que es un reporte que el formulario anterior dejó en la cola sin señal (rechazarlo lo perdería).
- **El servidor ubica la dirección, en este orden** (`locate-report.ts`, antes de abrir la transacción):
  1. **Predio oficial con la misma calle y número.** `address_key(text)` (migración 0016) normaliza la dirección: mayúsculas, sin tildes, sin tipo de vía ni "N°", y nada después del número. `worksite_contacts.address_key` es una columna generada con esa misma función, con índice. Si exactamente un predio oficial sin pedidos tiene esa clave, el reporte se suma a él con el mismo bloqueo `SKIP LOCKED` que el GPS, sin llamar a Google. Dos predios con la misma clave no se adivinan.
  2. **Geocoding API de Google**, llamada desde el servidor con `GOOGLE_MAPS_SERVER_KEY`: `region=cl`, `components=country:CL` (y `locality` si la emergencia tiene una sola comuna), `bounds` del área de la emergencia y `language=es`. Solo se acepta `ROOFTOP` o `RANGE_INTERPOLATED` a menos de ~1 km del área. Un punto geocodificado no se suma a un predio por cercanía: puede caer en el lote de al lado.
  3. **Sin punto.** Sin llave, con error, sin resultado preciso o pasados 3 s, el reporte se guarda igual, sin punto y con la marca `imprecise_location`. La cola de revisión lo lista y el coordinador pone el pin.
- Un reintento (recibo o casa ya existentes) no vuelve a llamar a Google.
- La dirección nunca va a un log ni a una métrica; `aluvia.worksites.geocode` cuenta solo el desenlace.

## Consecuencias

- Cada reporte que no coincide con un predio cuesta una llamada a Geocoding (USD 5 por 1.000). El tope por IP de los reportes acota el gasto.
- La llave del servidor se crea con Terraform (`infra/maps.tf`) y su valor se agrega a mano como versión del secreto, como toda credencial (`infra/README.md`).
- La carga en lote de coordinadores sigue aceptando borradores con pin o con dirección (`worksiteDraftSchema`), y la importación oficial no cambia.
