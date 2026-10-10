# Aluvia

Open-source platform to coordinate aid after a mudslide (aluvión): which homes are affected, what each one needs, where volunteers are needed. Born from the 2026-10-08 Las Condes aluvión. Two maintainers, every change lands by PR with cross review. Target cloud is GCP.

## Must-knows

- Read `docs/README.md` (research and requirements) before proposing features.
- Workflow and commit format: `CONTRIBUTING.md`. Never commit to `main`.
- The repo is public and the data is personal: `SECURITY.md`. No real addresses, phones or names anywhere in the repo, including tests and fixtures.
- Code and comments in English; user-facing strings in neutral LATAM Spanish through `t()`.
- Long-tail decisions go in `docs/adr/NNNN-*.md`.
