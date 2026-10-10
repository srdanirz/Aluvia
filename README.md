# Aluvia

Plataforma abierta para coordinar la ayuda después de un aluvión: saber **qué casas están afectadas, qué necesita cada una y dónde hace falta gente**, en vez de hacerlo puerta a puerta y por WhatsApp.

Creada por vecinos de Las Condes, Daniel y Santiago, con mucho cariño para nuestra comuna, después del aluvión del 8 de octubre de 2026 en San Carlos de Apoquindo.

Es open source y no es solo para Las Condes: está pensada para que cualquier comuna o ciudad la use ante un aluvión, una inundación, un incendio u otro desastre parecido.

## Estado

Base del proyecto lista (Next.js, Postgres + PostGIS, design system, idiomas y CI). Las features se construyen sobre ella.

- [Investigación y contexto](docs/README.md): qué pasó, cómo se resolvió en otros países y qué requisitos salen de ahí.
- [Decisiones de arquitectura](docs/adr/): nube, stack, mapa, design system, modelo de datos, notificaciones y observabilidad.
- Ingeniería: [STYLEGUIDE](docs/STYLEGUIDE.md) · [DESIGN](docs/DESIGN.md).

## Correr en local

Requiere Node 22, pnpm 10 y Docker.

```bash
pnpm install
cp .env.example .env.local
pnpm db:up && pnpm db:migrate
pnpm dev          # app en http://localhost:3002
pnpm db:studio    # base de datos en https://local.drizzle.studio/?port=3003
```

| Servicio | Puerto |
|---|---|
| App (Next.js) | 3002 |
| Drizzle Studio | 3003 |
| Postgres + PostGIS | 5440 |

`pnpm check` corre todo lo que corre el CI: tipos, lint, formato, tests y build. Catálogo del design system: http://localhost:3002/es/dev/ui

## Cómo trabajamos

Todo entra por Pull Request con revisión cruzada. Lee [CONTRIBUTING.md](CONTRIBUTING.md) antes de abrir tu primer PR.

## Datos personales

Esta app maneja direcciones, teléfonos y situación de familias afectadas. Lee [SECURITY.md](SECURITY.md): ningún dato real entra al repositorio, nunca.

## Licencia

[MIT](LICENSE).
