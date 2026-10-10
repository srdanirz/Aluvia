# 0009 · Multi-desastre y admin

- **Estado:** aceptada
- **Fecha:** 2026-10-10

## Contexto

Aluvia nace de un aluvión, pero tiene que servir para una inundación, un incendio o un terremoto, en cualquier comuna, sin tocar código. Si el tipo de desastre, la zona o el catálogo de trabajos quedan escritos en el código, cada emergencia nueva es un deploy, y un fork para otro país es un trabajo de semanas.

## Decisión

**Nada específico de un desastre vive en el código de la app.** Todo es configuración de la emergencia, guardada en la base y editada desde el admin.

| Qué | Dónde vive |
|---|---|
| Tipo de desastre (aluvión, inundación, incendio, terremoto, tormenta…) | `disaster_types`, un registro: agregar un tipo es una fila |
| Plantilla de trabajos por tipo (barro y agua en un aluvión; escombros y techo en un incendio) | `disaster_type_work_types` |
| Catálogo de trabajos de una emergencia | `work_types` con `emergency_id`: se copia de la plantilla al crearla y se edita sin afectar a otras |
| Nombre, comunas, área (polígono), zona horaria, inicio, cierre, fecha de borrado de datos | `emergencies` |
| Topes de SMS y WhatsApp, reserva para vecinos sin app, contacto oficial, nombre del catastro oficial ("FIBE" en Chile) | `emergency_settings` |
| Nombres de la emergencia y de sus trabajos | `jsonb` por idioma (`{"es": "…", "en": "…"}`) |

**Datos iniciales.** Los tipos de desastre, sus plantillas y la primera emergencia (Las Condes, aluvión de octubre de 2026) son *seeds* revisados en `src/shared/db/seeds/`. Es el único lugar del repo donde se nombran desastres, comunas o trabajos; la app los lee de la base.

### Textos

- `messages/*.json` guarda la interfaz, igual para cualquier desastre.
- Los nombres que vienen de la base usan `jsonb` por idioma. Si falta el idioma del usuario, se muestra el idioma por defecto de la emergencia (`emergencies.default_locale`). El admin marca las emergencias y trabajos sin traducción a algún idioma activo del registro de idiomas; agregar un idioma a la app no exige traducir los datos existentes de inmediato.
- Los **avisos** (ADR 0007) siguen siendo plantillas fijas de `messages/*.json` (y, en WhatsApp, aprobadas por Meta). El admin solo configura sus **parámetros**: nombre de la emergencia y contacto oficial. No hay texto libre en un aviso, así que ninguno puede llevar una dirección o un teléfono de un vecino.

### Admin

- Vive en `/[locale]/admin`, dentro de la misma app: misma base, mismo deploy, mismo design system. La feature es `features/admin/`. `admin.<dominio>` es solo un dominio que `proxy.ts` reescribe a `/[locale]/admin` (con el idioma negociado); se agrega a la restricción de la API key de Google Maps (ADR 0006).
- Lo usan los **administradores de la plataforma** (`users.platform_role = 'admin'`), un rol distinto de los roles por emergencia (`emergency_members`). El primer admin se crea con un comando de una vez (`pnpm admin:grant <email>`), que exige acceso a la base; después, solo un admin otorga o quita el rol a otro, desde el admin.
- Un admin **no ve contactos de vecinos** por ser admin: si necesita verlos en una emergencia, se agrega como coordinador de esa emergencia y queda en `contact_views` como cualquier coordinador.
- Desde el admin se:
  - crea, abre y cierra una emergencia (tipo, nombre, comunas, área, zona horaria, inicio y cierre);
  - edita el catálogo de trabajos de cada emergencia: renombrar, reordenar o desactivar; un tipo ya usado nunca se borra;
  - aprueba coordinadores; un admin no puede aprobarse a sí mismo, lo aprueba otro admin;
  - configura topes de SMS y WhatsApp y el contacto oficial;
  - ve el estado de cada emergencia (casas, trabajos sin tomar, zonas sin atender);
  - ejecuta el borrado de datos personales al cerrar (ADR 0005).
- **Área de la emergencia:** se dibuja sobre el mapa de Google con Terra Draw (`terra-draw` y su adaptador de Google Maps), porque la Drawing Library de Google está deprecada y dejó de estar disponible en mayo de 2026. Si el mapa no carga, se sube un archivo GeoJSON con el polígono.
- Cada acción queda en `admin_events` (quién, qué, cuándo y, si aplica, sobre qué emergencia). Nunca se edita.

### Rutas

Todo lo de una emergencia cuelga de su `slug`:

- Páginas: `/[locale]/emergencies/[slug]`, `/[locale]/emergencies/[slug]/worksites/[id]`.
- API: `GET /api/v1/emergencies/[slug]/worksites?bbox=…`.
- La portada lista las emergencias abiertas; con una sola, entra directo.

## Consecuencias

- ADR 0005 suma `disaster_types`, `disaster_type_work_types`, `emergency_settings`, `admin_events`, `emergencies.slug`, `emergencies.disaster_type_key`, `emergencies.default_locale`, `emergencies.time_zone`, `emergencies.started_at`, `emergencies.closed_at`, `emergency_settings.official_survey_name`, `worksites.official_survey_done`, `work_types.emergency_id` y `users.platform_role`.
- Un PR que escriba en el código de la app el nombre de un desastre, una comuna o un tipo de trabajo se rechaza: va en la base, o en un seed revisado.
