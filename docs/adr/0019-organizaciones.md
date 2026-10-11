# 0019 · Organizaciones con sus propios coordinadores

- **Estado:** aceptada
- **Fecha:** 2026-10-10

## Contexto

En una emergencia ayudan grupos que ya existen: una junta de vecinos, una parroquia, una ONG. Cada uno trae a sus coordinadores, y los vecinos confían más cuando saben qué grupo está atendiendo su casa. Hasta ahora un coordinador era una persona suelta (ADR 0013), sin forma de decir a quién representa.

## Decisión

**Una organización es una fila por emergencia, sin permisos propios.** Sus coordinadores son miembros de la emergencia con rol `coordinator` y `organization_id`. No hay un segundo sistema de permisos: tienen exactamente lo que tiene cualquier coordinador de esa emergencia (`getEmergencyAccess`, `canUpdateWorksite`, `canViewContacts`).

| Qué | Dónde |
|---|---|
| Nombre y contacto público opcional | `organizations` (`emergency_id`, nombre único sin importar mayúsculas ni espacios) |
| Quién la coordina | `emergency_members.organization_id`, solo con `role = 'coordinator'` (`CHECK`) |
| Cómo se entra | `invitations.organization_id`: un link de coordinador de esa organización, con el flujo de ADR 0013 |

- **Las crea un admin de plataforma** desde `/admin/emergencies/[slug]/organizations`, con el rol verificado dentro del `INSERT` y su fila en `admin_events`. Dos admins que crean el mismo grupo a la vez terminan con una fila (índice único) y un `organization_exists`.
- **Invitar** reutiliza los links de ADR 0013: un link de una organización solo otorga `coordinator`, la FK compuesta `(organization_id, emergency_id)` impide apuntar a un grupo de otra emergencia, y aceptarlo suma a un coordinador sin organización a esta. Nunca cambia de organización a quien ya está en una.
- **Quitar** a un coordinador es quitarle el rol (`revokeMemberRole`): vuelve a voluntario y sale de la organización en la misma sentencia.
- **Lo público:** la ficha de una casa y la lista de Reportes muestran "Atiende: <organización>" cuando un coordinador de una organización tomó un trabajo de esa casa. Se muestra el grupo y su contacto público, nunca la persona que tomó el trabajo. Se calcula en la misma consulta de cada vista (`attendingOrganizationsSql`), sin consultas por fila.
- **FK de miembros:** `NO ACTION DEFERRABLE INITIALLY DEFERRED` (a mano en la migración 0021): un grupo con coordinadores no se borra, y borrar la emergencia cae en cascada en cualquier orden (AI_PITFALLS).

### Datos personales

La organización no es un dato personal: queda como historia de quién atendió. Al purgar (ADR 0005) las membresías se borran como siempre; de `organizations` se borran `created_by` y `public_contact`, por si alguien escribió su propio teléfono en vez del del grupo, igual que en los centros de acopio.

## Alternativas descartadas

- **Rol `organization_coordinator` nuevo:** duplicaría cada predicado de acceso y abriría la puerta a permisos distintos por organización, que nadie pidió.
- **Organización global, compartida entre emergencias:** una junta de vecinos actúa en una comuna y una emergencia; compartirla mezclaría coordinadores de emergencias distintas.
- **Mostrar organización por trabajo tomado por cualquier miembro:** un voluntario suelto no habla por un grupo; solo sus coordinadores, aprobados por un admin, lo hacen.
