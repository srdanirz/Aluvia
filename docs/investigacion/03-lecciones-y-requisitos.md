# Lecciones y requisitos para Aluvia

## Lecciones

1. **El cuello de botella es la información, no la ayuda.** En Valencia sobraban voluntarios y faltaba saber dónde y qué hacer.
2. **Verificar vale más que recopilar.** #Verificado19S funcionó porque alguien confirmaba en terreno cada pedido.
3. **Una sola fuente, no cinco.** Plataformas paralelas sin compartir datos fragmentan la ayuda.
4. **Faltantes y sobrantes.** Sin saber qué sobra, los centros de acopio se llenan de cosas inútiles.
5. **Turnos y punto de encuentro.** Viña y Valencia ordenaron a los voluntarios con bloques horarios y salidas fijas; sin eso, la gente llega en auto y bloquea las calles.
6. **Datos sensibles.** Teléfono y dirección públicos de una casa vacía es un riesgo real (ver SECURITY.md).
7. **No competir con la FIBE.** El Estado ya catastra para entregar ayudas; Aluvia coordina el día a día y ayuda a que nadie quede sin FIBE.
8. **Alcance estrecho, rápido.** Afet Harita sirvió porque salió en horas haciendo una sola cosa bien.

## Roles

- **Vecino afectado:** reporta su casa y lo que necesita, desde el celular, sin crear cuenta compleja.
- **Voluntario:** ve dónde se necesita gente, se anota a un turno, marca tareas como hechas.
- **Coordinador** (junta de vecinos, municipio, organización): verifica reportes, prioriza, asigna, ve datos de contacto.

## MVP propuesto

Por orden de prioridad:

Modelo tomado de Crisis Cleanup: **casa (*worksite*) → trabajos (*work items*) → tomado o no → estado.**

1. **Ficha de casa:** ubicación, nivel de daño (leve / moderado / grave / inhabitable), personas vulnerables (sí/no), FIBE aplicada (sí/no).
2. **Trabajos por casa**, cada uno de un tipo del catálogo (barro, agua, comida, ropa, techo, medicamentos, mano de obra), con estado. Abiertos: sin tomar, tomado, parcialmente hecho, necesita seguimiento. Cerrados: hecho, hecho por otros, no quiere ayuda, duplicado. Aparte, cada trabajo lleva una marca de **verificado** en terreno (lección de #Verificado19S).
3. **Mapa** de casas por prioridad, con ubicación aproximada en la vista pública (ADR 0003).
4. **Turnos de voluntarios** por zona y tipo de tarea, con cupo.
5. **Panel de coordinador** con filtros y exportación para el municipio.

Fuera del MVP: donaciones en dinero, chat, IA sobre redes sociales, app nativa. Una web móvil (PWA) alcanza y se comparte por link de WhatsApp.

## Preguntas abiertas

- ¿Quién verifica los reportes? ¿Junta de vecinos, municipio, o nosotros con voluntarios de confianza?
- ¿Coordinamos con la Municipalidad de Las Condes desde el día uno?
- ¿Funcionamiento con señal débil u offline en la zona afectada?
