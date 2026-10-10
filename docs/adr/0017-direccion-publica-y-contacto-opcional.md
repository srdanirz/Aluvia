# 0017 · Dirección completa pública y contacto público opcional

- **Estado:** aceptada
- **Fecha:** 2026-10-10
- **Reemplaza en parte:** ADR 0011 (qué se publica de una casa)

## Contexto

La ficha pública y Reportes mostraban la calle sin número (`streetWithoutNumberSql`). Un voluntario con la calle llega a la cuadra, no a la puerta, y para coordinar tenía que pasar por un coordinador que viera el contacto. Los mantenedores decidieron que llegar y hablar con quien pidió ayuda pesa más que ocultar el número.

## Decisión

1. **La dirección escrita completa es pública**: número incluido, en la ficha de la casa, en Reportes y donde hoy se muestra la calle (`publicAddressSql`, `src/features/map/server/public-address.ts`).
2. **Nombre y teléfono públicos solo si quien reporta lo elige**: `worksite_contacts.public_contact boolean NOT NULL DEFAULT false`. El formulario muestra la opción marcada por defecto junto al nombre y el teléfono. La ficha pública los muestra con un enlace `tel:`; Reportes, en la tarjeta.
3. **Lo anterior queda privado**: las filas existentes quedan en `false`, como se les prometió a esos vecinos. La carga en lote y la importación oficial siempre guardan `false`.
4. **Al sumarse a un predio existente**, la opción vale solo si el reporte trae nombre o teléfono, y nunca publica un nombre o teléfono que otro reporte dejó privado.
5. Sin cambios para coordinadores: la tarjeta "Dirección y contacto" y el registro en `contact_views` siguen igual.

## Consecuencias

- Una dirección escrita ya no es privada, así que el riesgo de casas vacías identificables sube; se acepta por la velocidad de ayuda.
- Notas, vulnerabilidad y si la casa está sin gente siguen solo para coordinadores.
- El borrado de una emergencia (`src/shared/db/purge.ts`) ya elimina `worksite_contacts`, opción incluida.
