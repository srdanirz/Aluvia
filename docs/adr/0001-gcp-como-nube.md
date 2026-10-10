# 0001 · GCP como nube

- **Estado:** aceptada
- **Fecha:** 2026-10-09

## Contexto

Necesitamos desplegar rápido, con costo cercano a cero mientras el tráfico sea bajo, y aguantar picos si el link circula por WhatsApp.

## Decisión

Usamos Google Cloud Platform. El stack concreto (Cloud Run, Firestore o Cloud SQL, autenticación) se decide en un ADR propio cuando definamos el modelo de datos.

## Consecuencias

- Credenciales en Secret Manager, nunca en el repo.
- Una cuenta de facturación con alertas de presupuesto desde el primer día.
- Infraestructura descrita como código cuando exista, para que cualquiera pueda replicar Aluvia en otra emergencia.
