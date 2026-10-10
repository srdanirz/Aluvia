# Casos borde

Qué suele salir mal en apps de coordinación de ayuda y qué hace Aluvia al respecto. Cada caso dice si viene de una fuente o es razonamiento propio, y qué lo cubre.

**Estado:** `listo` lo cubre un doc o ADR existente · `issue` hay issue abierto · `falta` no está cubierto.
**Prioridad:** `salida` es necesario para publicar hoy · `semana` puede esperar unos días.

## 1. Información falsa o maliciosa

| Caso | Mitigación | Estado | Prioridad |
|---|---|---|---|
| Alguien reporta casas que no existen o llena el mapa de basura | Todo reporte nace **sin verificar**. Límite de reportes por teléfono y por IP (SECURITY.md) | listo (parcial), #20 | salida |
| Reportes verdaderos que llegan desde varias fuentes sobre el mismo lugar | Agrupar por cercanía: varios reportes en el mismo punto suben la confianza. Es lo que hizo Ushahidi en Haití ([CJR](https://www.cjr.org/behind_the_news/the_challenge_of_verifying_cro.php)) | falta | semana |
| Un reporte por SMS dudoso | Llamar de vuelta al número antes de confirmar (Ushahidi Haití lo hacía) | falta | semana |
| Rumores que se vuelven virales ("se rompió el tranque", "no vayan") | Un aviso oficial fijo en el mapa, editable solo por administradores. En Helene un rumor de represa hizo evacuar a cientos sin necesidad ([Spectrum](https://spectrumlocalnews.com/nc/charlotte/news/2024/10/08/hurricane-helene-misinformation)). En Valencia se contaron 192 bulos en tres semanas ([UPV](https://cienciagandia.webs.upv.es/en/2025/09/how-the-fake-stories-about-the-dana-took-shape/)) | falta | salida |
| Un coordinador o voluntario con acceso se equivoca o actúa mal | Todo cambio queda con autor y se puede revertir. Historial append-only (ADR 0005) | listo, #16 | salida |
| Cuenta de coordinador robada | Aprobación a mano, links de invitación que caducan y se revocan | #16 | salida |

## 2. Estafas y seguridad de los vecinos

| Caso | Mitigación | Estado | Prioridad |
|---|---|---|---|
| Falsos voluntarios, contratistas o "Cruz Roja" que van casa por casa pidiendo plata. Pasó en Valencia ([Majorca Daily Bulletin](https://majorcadailybulletin.com/news/local/2024/11/03/128729/fake-red-cross-scam-mallorca.html)) y es lo primero que aparece después de inundaciones en EE. UU. ([FEMA](https://www.fema.gov/fr/node/691365)) | Mensaje en el bot y en el mapa: "Aluvia nunca pide plata". El vecino recibe el nombre y la hora del voluntario que va a su casa | falta | salida |
| Publicar una dirección con la casa vacía invita a robos. Hay antecedentes de robos en zonas inundadas ([Otago Daily Times](https://www.odt.co.nz/news/southland/properties-targeted-by-thieves-in-wake-of-flooding-ds5g1hpl)) | Mapa público con ubicación aproximada. **Nunca** un campo "casa sin gente" visible al público | listo | salida |
| Alguien se hace pasar por policía o autoridad para entrar a una casa | Voluntarios identificables y registrados. El vecino puede ver quién viene antes de que llegue | falta | semana |
| Una persona que pidió ayuda ya no la quiere, o no quiere fotos ni visitas | Estado "no quiere ayuda" (ya existe en el modelo) y se respeta sin insistir | listo | salida |

## 3. Voluntarios: demasiados, mal repartidos

| Caso | Mitigación | Estado | Prioridad |
|---|---|---|---|
| Todos van a las primeras direcciones, el resto queda solo | Priorizar por abandono, no solo por daño | #3 | salida |
| Muchos voluntarios en un solo punto. En Valencia hubo 10.000 personas en un solo punto de salida y atascos de hasta 39 km ([Público](https://www.publico.es/sociedad/dana-directo-ultima-hora-hoy-valencia.html)) | Cupo por punto y por turno. Un punto lleno se muestra como "cubierto" y deja de atraer gente | #8, shifts | salida |
| Voluntarios que esperan sin tener qué hacer y se van. De ahí nació Crisis Cleanup ([Church News](https://www.thechurchnews.com/2014/1/11/23223679/crisis-cleanup/)) | Lista "Dónde ayudar ahora" con una acción concreta | #10 | salida |
| Calles cortadas o acceso restringido a vehículos particulares (Valencia lo restringió) | Aviso oficial por zona y punto de encuentro con transporte | falta | semana |
| Un voluntario toma una casa y nunca llega | La reserva expira y vuelve a rojo | #12 | semana |
| Dos voluntarios toman el mismo trabajo en el mismo segundo | `UPDATE` condicional con test de concurrencia | listo | salida |
| Gente que quiere ayudar pero no puede ir (está lejos) | Vía para donar o difundir, sin que ocupe cupo de terreno. La investigación llama a esto la paradoja de inclusión y exclusión ([Aston](https://publications.aston.ac.uk/id/eprint/28207/1/Paradox_of_spontaneous_volunteering.pdf)) | falta | semana |

## 4. Información vieja o repetida

| Caso | Mitigación | Estado | Prioridad |
|---|---|---|---|
| La casa ya se limpió, pero sigue roja en el mapa | Cada casa muestra "última actualización hace X". Si pasa de un umbral, se marca como por confirmar y no como urgente | falta | salida |
| El mismo hogar reportado dos veces (el vecino y un vecino de al lado, o dos historias de Instagram) | Aviso de posible duplicado cuando hay un reporte a pocos metros. El coordinador fusiona. Estado "duplicado" ya existe. Los duplicados hacen gastar recursos dos veces ([estudio sobre Typhoon Dujuan](https://scholars.lib.ntu.edu.tw/entities/publication/9888a945-f0d2-43f4-8958-4dfc23e65567)) | falta | salida |
| Dirección mal escrita, sin número, parcela, condominio o calle con el mismo nombre en otra comuna | Manda el pin que el vecino confirma. Si no hay pin, queda pendiente de que un coordinador la ubique (ADR 0006) | listo | salida |
| Coordenadas fuera de la zona afectada (error de GPS, latitud y longitud invertidas) | Rechazar o marcar para revisión si el punto cae fuera del área de la emergencia (`emergencies.area`) | falta | salida |
| La foto vieja o de otro lugar | Quitar metadatos EXIF, y mostrar al coordinador la fecha de recepción, no la de la foto | #20 | semana |
| La cobertura cambia entre que el voluntario abre el mapa y llega | Datos frescos con refresco automático y la hora de la última lectura a la vista | falta | semana |

## 5. Seguridad de los voluntarios

| Caso | Mitigación | Estado | Prioridad |
|---|---|---|---|
| Barro con aguas servidas, vidrios, clavos: riesgo de tétanos y otras infecciones ([Purdue](https://www.purdue.edu/engineering/ABE/INPREPared/wp-content/uploads/2026/06/Tailgate-Flood-Cleanup-Safety-Briefing-for-Volunteers.pdf)) | Aviso corto antes de tomar un trabajo: botas, guantes, mascarilla, vacuna antitetánica al día | falta | salida |
| Electricidad, gas, estructura dañada: no entrar a una casa sin autorización | Marca "no entrar: riesgo" que bloquea que voluntarios la tomen hasta que un coordinador la revise | falta | salida |
| Moho: menores, asmáticos y personas con defensas bajas no deben entrar a casas con moho | Preguntar al tomar un trabajo, y no asignar a menores a casas con moho | falta | semana |
| Agotamiento y calor | Turnos con rotación (los turnos ya existen) | listo | semana |

## 6. Personas en peligro, no un trabajo de limpieza

| Caso | Mitigación | Estado | Prioridad |
|---|---|---|---|
| Alguien escribe "hay una persona atrapada" o "se está ahogando" | El bot responde primero con **131 (SAMU), 132 (Bomberos) y 133 (Carabineros)** y avisa a un coordinador. Aluvia no reemplaza emergencias (ADR 0007) | falta | salida |
| Adulto mayor solo, persona con discapacidad o sin medicinas | Casilla "personas vulnerables" sube la urgencia (ya existe). Medicinas son un tipo de trabajo | listo | salida |
| Los más callados no reportan (vecinos mayores sin celular). Quedan sin ayuda mientras otros piden mucho | Un vecino puede reportar por un tercero ("mi vecina de 80 años"), con una nota. Los coordinadores revisan zonas sin reportes | falta | semana |
| Personas desaparecidas | Fuera de alcance: es otra herramienta (Person Finder). Se deriva a canales oficiales | falta | semana |

## 7. Donaciones

| Caso | Mitigación | Estado | Prioridad |
|---|---|---|---|
| Llega mucha ropa y cosas inútiles que estorban: es "el segundo desastre" ([GovTech](https://www.govtech.com/em/disaster/Donations-Management-Managing-the-Second-Disaster.html), [Red Cross Australia](https://redcross.org.au/act/how-can-i-help/donating-clothes)) | Lista pública de lo que falta y de lo que **ya no** se necesita | #14 | salida |
| Un centro de acopio lleno sigue recibiendo | Estado de cada punto: recibe, lleno, solo cierto tipo de cosa | #14 | semana |
| Dinero en efectivo para "Aluvia" | Aluvia no recibe dinero. Fuera de alcance (docs de investigación) | listo | salida |

## 8. Canales y conectividad

| Caso | Mitigación | Estado | Prioridad |
|---|---|---|---|
| Sin datos ni señal en la zona | SMS sin fotos. Mensajes que se envían solos cuando vuelve la red | #20 | semana |
| WhatsApp se cae o Meta bloquea el número por spam | Segundo canal (SMS) y la web como respaldo. Si falla un solo canal, el sistema sigue. Cuando WhatsApp se cae, los pedidos no llegan ([nota](https://comunidad.espoesia.com/benchb327/whatsapp-down-how-outages-impact-emergency-communications-and-public-safety/)) | falta | salida |
| Meta solo deja contestar libremente 24 horas después del último mensaje | Plantillas aprobadas para avisos fuera de ventana. Pedir su aprobación hoy, porque tarda | #20 | salida |
| Audio con ruido de maquinaria, acento o mala conexión | Mostrar lo entendido y pedir confirmación. Nada se guarda sin confirmar | #17 | salida |
| Foto o audio muy pesado | Compresión en el celular y reintento. Límite de tamaño | falta | semana |
| El vecino manda solo "ayuda" sin ubicación | El bot pide el pin de WhatsApp, y si no puede, pide una referencia (esquina, almacén, junta de vecinos) | #20 | salida |
| Mensaje en otro idioma o con faltas | Mensajes en lenguaje simple. i18n listo para sumar idiomas | listo | semana |

## 9. Datos personales y legales

| Caso | Mitigación | Estado | Prioridad |
|---|---|---|---|
| Foto con cédula, rostros, niños o documentos a la vista | Fotos privadas, solo visibles para coordinadores. Advertir al vecino que no incluya personas ni documentos | #20 | salida |
| El vecino pide borrar sus datos | Canal claro para pedirlo y borrado efectivo (Ley 19.628). Borrado al cerrar la emergencia (ADR 0005) | listo, #20 | salida |
| Un menor reporta o es reportado | Se permite reportar. No se pide edad, y no se muestran nombres | falta | semana |
| El teléfono del vecino aparece en el mapa por error | Contacto en tabla aparte. Pruebas que fallan si una vista pública devuelve campos de contacto | listo | salida |
| Logs, errores o métricas con direcciones o teléfonos | Sin PII en logs ni eventos (ADR 0008) | listo | salida |

## 10. Operación y carga

| Caso | Mitigación | Estado | Prioridad |
|---|---|---|---|
| El link se hace viral y entra mucha gente de golpe | Cloud Run escala. Agrupación en servidor, nunca todas las casas | listo | salida |
| Se acaba la cuota de Google Maps | La app sigue con lista por zona (ADR 0006) | listo | salida |
| Muchas personas detrás de la misma IP móvil (CGNAT) | Límites generosos por IP (SECURITY.md), más límite por teléfono | listo | salida |
| Un reintento duplica una casa con señal mala | `id` generado en el cliente con `ON CONFLICT DO NOTHING` | listo | salida |
| Dos coordinadores editan la misma casa | Columna `version`, el segundo ve "recargar" | listo | salida |
| Los administradores no dan abasto | Verificación delegada a coordinadores de junta de vecinos. Cola de reportes por revisar con conteo | #16 | salida |
| Hay que cerrar la emergencia | Borrado de datos personales en una transacción (ADR 0005) | listo | semana |
| Alerta cuando una zona queda sin atender 24 horas | Alerta "zona sin atender" (ADR 0008) | listo | semana |

## Lo que no pude confirmar

La búsqueda no encontró evaluaciones públicas sobre Afet Haritası en Turquía (direcciones erróneas, duplicados) ni informes post-emergencia de la Generalitat Valenciana sobre su coordinación de voluntarios. Lo de esos casos arriba es razonamiento propio y no una lección documentada. Tampoco hay datos sobre cuánto spam recibe un bot de WhatsApp de emergencias.

## Fuentes principales

- [Crisis Cleanup: origen y problema](https://www.thechurchnews.com/2014/1/11/23223679/crisis-cleanup/)
- [Ushahidi Haití: verificación por agregación](https://www.cjr.org/behind_the_news/the_challenge_of_verifying_cro.php)
- [PetaBencana.id: validación de reportes](https://www.itu.int/hub/2022/08/crowdsourcing-helps-mitigate-disasters/)
- [Valencia 2024: bulos](https://cienciagandia.webs.upv.es/en/2025/09/how-the-fake-stories-about-the-dana-took-shape/) y [voluntariado](https://valenciaplaza.com/valenciaplaza/voluntarios-tras-dana-de-la-solidaridad-inmediata-a-la-necesidad-de-perpetuar-el-movimiento)
- [Convergencia de voluntarios espontáneos](https://publications.aston.ac.uk/id/eprint/28207/1/Paradox_of_spontaneous_volunteering.pdf)
- [Estafas tras inundaciones (FEMA)](https://www.fema.gov/fr/node/691365)
- [Seguridad en limpieza de barro (Purdue)](https://www.purdue.edu/engineering/ABE/INPREPared/wp-content/uploads/2026/06/Tailgate-Flood-Cleanup-Safety-Briefing-for-Volunteers.pdf)
- [Donaciones como segundo desastre](https://www.govtech.com/em/disaster/Donations-Management-Managing-the-Second-Disaster.html)
