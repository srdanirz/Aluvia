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

## Alcance

Se construye completo y bien hecho desde el primer deploy; el orden es solo el de construcción. Modelo de Crisis Cleanup: **casa (*worksite*) → trabajos (*work items*) → tomado o no → estado.**

1. **Ficha de casa:** ubicación, nivel de daño (leve / moderado / grave / inhabitable), personas vulnerables, FIBE aplicada, origen del reporte (vecino, coordinador, redes sociales).
2. **Trabajos por casa** del catálogo (barro, agua, comida, ropa, techo, medicamentos, mano de obra). Abiertos: sin tomar, tomado, parcialmente hecho, necesita seguimiento. Cerrados: hecho, hecho por otros, no quiere ayuda, duplicado. Marca de **verificado** en terreno (#Verificado19S).
3. **Prioridad por abandono** (issue #3): primero las casas sin ningún trabajo tomado, luego daño y personas vulnerables, luego tiempo de espera, dentro de la zona del voluntario. Cada casa muestra cuánto lleva esperando.
4. **Detección de duplicados:** al confirmar un pin, aviso si ya hay una casa a menos de 15 m.
5. **Carga en lote** (issue #3): el coordinador pega el texto de una historia o un mensaje y el servidor le pide a Claude (API de Anthropic) que extraiga las direcciones. La salida se valida con zod y solo crea borradores: el coordinador confirma el pin de cada una. El texto pegado no se guarda; solo los borradores. Origen "redes sociales", sin verificar y sin avisos al residente hasta su consentimiento. Con un LLM y no con regex porque las historias mezclan direcciones, nombres y referencias ("frente a la plaza") sin formato.
6. **Mapa** con ubicación aproximada en la vista pública (ADR 0006) y vista de lista equivalente.
7. **Turnos de voluntarios** por zona y tipo de tarea, con cupo.
8. **Panel de coordinador** con filtros y exportación para el municipio.
9. **Notificaciones** en todos los canales (ADR 0007) y **observabilidad** completa (ADR 0008).

Fuera de alcance: donaciones en dinero (otro marco legal), chat (ya existe WhatsApp), app nativa (la PWA instalable cubre celular y tablet) y leer redes sociales automáticamente (solo se procesa lo que pega un coordinador).

## Preguntas abiertas

- ¿Quién verifica los reportes? ¿Junta de vecinos, municipio, o nosotros con voluntarios de confianza?
- ¿Coordinamos con la Municipalidad de Las Condes desde el día uno?
- ¿Funcionamiento con señal débil u offline en la zona afectada?
