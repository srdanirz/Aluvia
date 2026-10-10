# Cómo contribuir

Somos dos mantenedores. Cada uno revisa el trabajo del otro, y así los dos sabemos siempre qué está pasando en el código.

## Flujo

1. **Toma o crea un issue** antes de empezar y asígnatelo. Así el otro sabe en qué estás.
2. **Actualiza `main` y crea la rama**, siempre en ese orden:
   `git switch main && git pull --ff-only && git switch -c feat/mapa-casas`.
   Prefijos: `feat/…` `fix/…` `refactor/…` `docs/…` `chore/…`.
3. **Commits** en inglés con [Conventional Commits](https://www.conventionalcommits.org/):
   `type(scope): subject`, imperativo, sin punto final, menos de 72 caracteres.
   Tipos: `feat` `fix` `chore` `build` `refactor` `docs` `ui` `test`.
4. **Abre el PR temprano** (como Draft si no está listo). Rellena la plantilla: qué cambia, por qué, cómo probarlo.
5. **Rebase sobre `main` antes de pedir revisión**, nunca merge de `main` hacia tu rama:
   `git fetch origin main && git rebase origin/main`, vuelve a correr los checks y
   `git push --force-with-lease --force-if-includes`.
   Ese par de flags evita sobrescribir commits que el otro haya subido a tu rama y que no integraste.
   Si `main` avanzó después de la aprobación, GitHub no deja mergear hasta rebasear (exige la rama al día), y el rebase descarta la aprobación: se pide de nuevo. Por eso conviene rebasear justo antes de pedir revisión y mergear apenas se aprueba.
6. **El otro mantenedor revisa.** Nadie aprueba ni mergea su propio PR. `main` está protegida y exige una aprobación.
7. **Squash and merge** y se borra la rama. Después: `git switch main && git pull --ff-only`.

## Cómo se ve un buen PR

La plantilla se carga sola al abrir el PR. Lo que la hace funcionar:

- **Título = commit del squash**, en inglés y Conventional Commits: `feat(work-items): claim a work item from the map`.
- **Una sola cosa.** Si la descripción necesita un "y además", son dos PRs.
- **"Qué cambia" en lenguaje de producto**: "un voluntario puede tomar un trabajo desde el mapa", no "agrego claimWorkItem".
- **Evidencia, no promesas**: el output de los tests, capturas de muestra a 375 y 1024 px en los dos temas (la prueba cubre 375, 768, 1024 y 1440), el `EXPLAIN ANALYZE` de un listado nuevo.
- **Riesgos y lo que queda fuera**, con dónde quedó anotado lo pendiente (un issue, no "después").
- **Del checklist se marca lo que aplica**; lo que no aplica se borra, no se marca.

Los issues usan formularios (`.github/ISSUE_TEMPLATE/`): feature o error. Un error siempre dice su impacto; "alguien no puede pedir o recibir ayuda" se atiende antes que todo.

## Revisión

- Ritmo: un PR abierto no espera más de **12 horas** sin primera revisión mientras dure la emergencia. Si no puedes revisar, avisa.
- PRs chicos: idealmente menos de 400 líneas. Uno grande se divide.
- Comentarios con prefijo para que quede claro el peso:
  `bloqueante:` hay que arreglarlo antes de mergear · `sugerencia:` opcional · `pregunta:` necesito entender.
- Lo bloqueante se resuelve en el mismo PR, no en "uno siguiente".

## Reglas de código

Las reglas completas están en [docs/STYLEGUIDE.md](docs/STYLEGUIDE.md). Lo que más se revisa:

- Sin N+1: todo listado trae su test de conteo de consultas.
- Sin race conditions: tomar o inscribirse es un `UPDATE` condicional, con test de concurrencia.
- UI solo con el design system (`src/shared/ui/`), sin estilos propios en las features.
- Identificadores y comentarios en inglés. Texto que lee el usuario final en español, siempre por `t()` (i18n).
- Términos de dominio chilenos se quedan en español: `comuna`, `rut`, `fibe`.
- Nada de datos reales en el repo: ni en tests, ni en fixtures, ni en capturas. Ver [SECURITY.md](SECURITY.md).

## Decisiones grandes

Stack, modelo de datos, proveedores: se documentan como ADR en `docs/adr/NNNN-titulo.md` y se aprueban por PR como cualquier otro cambio.
