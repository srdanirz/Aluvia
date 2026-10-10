# 0015 · Aviso oficial de la emergencia

- **Estado:** aceptada
- **Fecha:** 2026-10-10

## Contexto

En un desastre los rumores se viralizan más rápido que la información oficial ("se rompió el tranque", "no vayan"). En Helene un rumor de represa hizo evacuar a cientos sin necesidad, y en Valencia se contaron 192 bulos en tres semanas (`docs/investigacion/04-casos-borde.md`). Hace falta un lugar donde el administrador desmienta un rumor o avise un corte, visible donde la gente ya está mirando: el mapa y el reporte.

El ADR 0009 dice que los **avisos** (las notificaciones del ADR 0007) no llevan texto libre, para que ninguno pueda llevar la dirección o el teléfono de un vecino. El aviso oficial es otra cosa: no se envía a nadie, se muestra fijo en la emergencia.

## Decisión

- **Un aviso vigente por emergencia**, en `emergency_notices`: texto por idioma (`jsonb`), quién lo publicó y cuándo, y `withdrawn_at`. Publicar uno nuevo retira el anterior en la misma transacción, así la tabla es también su historial. Un índice único parcial garantiza uno solo vigente.
- **Solo administradores** de la plataforma lo publican, reemplazan o retiran, desde la ficha de la emergencia. Cada acción queda en `admin_events`.
- **Texto libre, con responsabilidad acotada.** Es el único texto libre público que escribe la plataforma, porque desmentir un rumor concreto no cabe en una plantilla. Lo mitigan: lo escriben solo administradores, la ayuda del campo dice que nunca lleva datos de un vecino, cada versión queda con autor y fecha, y se retira con un toque.
- **Obligatorio en el idioma por defecto** de la emergencia, que es el respaldo al leerlo en otro idioma.
- **Lectura pública** con `findActiveNotice(db, emergencyId)` de `@/features/admin`: mapa y reporte lo muestran arriba.
- Cerrar la emergencia retira su aviso.

## Consecuencias

- Un aviso por zona (calles cortadas en un sector) queda fuera: se agrega con una columna de área en la misma tabla cuando se priorice.
- Si un aviso llegara a publicar un dato personal, se retira y la fila queda en el historial: la purga de datos personales del ADR 0005 debe incluir `emergency_notices` al cerrar la emergencia (#30).
