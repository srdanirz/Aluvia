# Cómo contribuir

Somos dos mantenedores. Cada uno revisa el trabajo del otro, y así los dos sabemos siempre qué está pasando en el código.

## Flujo

1. **Toma o crea un issue** antes de empezar y asígnatelo. Así el otro sabe en qué estás.
2. **Crea la rama primero**, desde `main` actualizado:
   `feat/…` `fix/…` `refactor/…` `docs/…` `chore/…` (ej. `feat/mapa-casas`).
3. **Commits** en inglés con [Conventional Commits](https://www.conventionalcommits.org/):
   `type(scope): subject`, imperativo, sin punto final, menos de 72 caracteres.
   Tipos: `feat` `fix` `chore` `build` `refactor` `docs` `ui` `test`.
4. **Abre el PR temprano** (como Draft si no está listo). Rellena la plantilla: qué cambia, por qué, cómo probarlo.
5. **El otro mantenedor revisa.** Nadie aprueba ni mergea su propio PR. `main` está protegida y exige una aprobación.
6. **Squash and merge** y se borra la rama.

## Revisión

- Ritmo: un PR abierto no espera más de **12 horas** sin primera revisión mientras dure la emergencia. Si no puedes revisar, avisa.
- PRs chicos: idealmente menos de 400 líneas. Uno grande se divide.
- Comentarios con prefijo para que quede claro el peso:
  `bloqueante:` hay que arreglarlo antes de mergear · `sugerencia:` opcional · `pregunta:` necesito entender.
- Lo bloqueante se resuelve en el mismo PR, no en "uno siguiente".

## Reglas de código

- Identificadores y comentarios en inglés. Texto que lee el usuario final en español, siempre por `t()` (i18n).
- Términos de dominio chilenos se quedan en español: `comuna`, `rut`, `fibe`.
- Nada de datos reales en el repo: ni en tests, ni en fixtures, ni en capturas. Ver [SECURITY.md](SECURITY.md).

## Decisiones grandes

Stack, modelo de datos, proveedores: se documentan como ADR en `docs/adr/NNNN-titulo.md` y se aprueban por PR como cualquier otro cambio.
