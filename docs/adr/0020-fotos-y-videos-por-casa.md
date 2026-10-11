# 0020 · Fotos y videos por casa

- **Estado:** aceptada
- **Fecha:** 2026-10-10

## Contexto

Una casa se entiende mejor con una foto que con tres campos (#79). Quien reporta o actualiza una casa quiere mostrar el daño desde el teléfono, muchas veces con mala señal. Una foto de celular trae EXIF con la ubicación GPS y el modelo del teléfono, y puede mostrar caras, niños o documentos (docs/investigacion/04-casos-borde.md). Cloud Run no guarda archivos y la base no es lugar para bytes.

## Decisión

| Tema | Decisión |
|---|---|
| Límites | Hasta 5 fotos y 1 video de 30 s y 50 MB por casa. Lo oculto no cuenta. La base decide: se bloquea la fila de la casa y el `INSERT` lleva el conteo en su `WHERE` |
| Dónde | Bucket privado `<proyecto>-media` en Santiago, acceso uniforme y prevención de acceso público (`infra/media.tf`) |
| Subida | Directa del teléfono al bucket con una URL firmada V4 de 15 min, que fija el tipo y el tamaño máximo (`x-goog-content-length-range`). La app nunca recibe los bytes por un request |
| Quién | Cualquiera, sin cuenta, como reportar. Límite de 30 pedidos por red cada 10 min |
| Limpieza | El original va a `uploads/` y nunca es público. El servidor lo lee y publica una copia en `media/`: la foto se decodifica y se re-codifica a WebP de 1600 px con `sharp`, que no escribe metadatos (EXIF, GPS, XMP); el video se re-empaqueta con `ffmpeg -c copy -map_metadata -1` sin re-codificar, y `ffprobe` verifica que dure 30 s o menos. Lo que no se decodifica se rechaza |
| En el teléfono | La foto se achica a 2048 px en JPEG antes de subir: menos datos con 3G, y el navegador decodifica HEIC, que el servidor no |
| Sin señal | Cada archivo es una entrada de la cola existente (`src/shared/offline/outbox.ts`, tipo `worksite_media`) con sus bytes en IndexedDB. Tres pasos que se pueden repetir: reservar (por el id del cliente), subir y completar. Una foto de un reporte en cola sale después del reporte y usa su id: el servidor sigue `report_receipts` hasta la casa donde terminó |
| Ver | Público en la ficha de la casa con URLs firmadas de lectura de 15 min, cacheadas por instancia dos tercios de su vida. Sin `next/image`: el optimizador guardaría copias más allá de la firma |
| Moderar | Un coordinador (o admin de la plataforma) oculta o vuelve a mostrar cada archivo; la sentencia misma verifica el rol |
| Advertencia | Sobre el botón de elegir, antes de elegir: sin caras, niños, patentes ni documentos, porque se ven en la ficha pública |
| Purga | `purgeEmergencyPersonalData` borra las filas y encola sus objetos en `media_object_deletions` en la misma transacción. La llamada programada `media-delete-queued` (cada minuto) los borra del bucket y también suelta las subidas abandonadas más de un día. Una regla del bucket borra `uploads/` al día por si algo se escapa |

## Alternativas descartadas

- **Subir por la app (multipart a Cloud Run):** 50 MB por request ocupan la instancia y la memoria; la URL firmada deja el tráfico entre el teléfono y Google.
- **Fotos solo para coordinadores** (lo que proponía el documento de casos borde): los mantenedores priorizan que un voluntario vea el daño antes de ir. Se compensa con la advertencia, la limpieza de metadatos y el ocultar.
- **Re-codificar el video:** necesitaría minutos de CPU por video en Cloud Run. Re-empaquetar quita la ubicación sin tocar la imagen.
- **Un job de Cloud Run aparte para procesar:** más piezas para el mismo resultado; una foto se procesa en menos de un segundo y un video re-empaquetado en pocos, dentro del request de completar.
- **Borrar objetos dentro de la purga:** una llamada externa no va dentro de una transacción (STYLEGUIDE, Robustez); la cola la hace confiable y repetible.

## Consecuencias

- La imagen de producción instala `ffmpeg` (Dockerfile).
- `MEDIA_BUCKET` sin poner apaga la función entera: ni selector ni galería. Así funcionan el desarrollo local, el CI y un fork.
- La cuenta de servicio de la app firma URLs con `signBlob` (rol `iam.serviceAccountTokenCreator` sobre sí misma): una llamada a IAM por firma que no está en caché.
- Métricas `aluvia.worksite_media.uploads` (paso, tipo, resultado) y `aluvia.worksite_media.deletions` (borrados y fallidos). Eventos `worksite_media_published` y `worksite_media_hidden`.
- Una foto vieja o de otro lugar no se detecta: el coordinador ve la fecha de recepción, no la de la foto, porque el EXIF se borra.
