# 0002 · Stack: Next.js full-stack con Postgres + PostGIS

- **Estado:** aceptada
- **Fecha:** 2026-10-09

## Contexto

Dos desarrolladores web, una emergencia en curso y un proyecto que queremos que otros puedan forkear para la próxima. Los datos son relacionales (emergencia → casa → trabajos → voluntarios → turnos) y geográficos (qué hay cerca, qué cae en esta zona).

## Decisión

- **App:** Next.js 16 (App Router), TypeScript strict, un solo deployable en **Cloud Run**.
- **Base de datos:** Postgres con **PostGIS** en **Cloud SQL**.
- **ORM:** Drizzle. Sus consultas relacionales (`findMany({ with })`) resuelven las relaciones en una sola consulta SQL, lo que corta de raíz el N+1 más común.
- **Formularios y validación:** react-hook-form + zod, con el mismo schema en cliente y servidor.
- **Estado de servidor en el cliente:** TanStack Query, solo donde haya interacción que lo justifique (mapa, panel en vivo).
- **i18n:** next-intl, `es` y `en`.
- **Tests:** Vitest, integración contra Postgres real con PostGIS, Playwright para el flujo principal.

## Alternativas descartadas

- **Rails 8 API + React** (como sur): mejores herramientas contra N+1 (Bullet, Prosopite), pero son dos lenguajes y dos deploys, y menos contribuidores posibles.
- **FastAPI + Next.js** (como sonda y croma): también dos deploys.
- **Firestore:** no tiene joins ni consultas geográficas reales, y casi todas las vistas de Aluvia necesitan las dos cosas.

## Consecuencias

- Drizzle no trae un detector de N+1 como Bullet, así que el control queda en un test que cuenta consultas (ver `docs/STYLEGUIDE.md`, Performance).
- Las versiones exactas se fijan en el PR del scaffold, no aquí.
