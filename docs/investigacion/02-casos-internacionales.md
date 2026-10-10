# Casos de otros desastres

## DANA de Valencia, España (octubre 2024)

La inundación más parecida en escala urbana. Surgieron varias herramientas en paralelo:

- **AyudaTerreta** (ciudadana): mapa interactivo donde el afectado marca ubicación, necesidad concreta y teléfono; voluntarios lo toman y el estado de la ayuda se actualiza. Es lo más cercano a lo que queremos hacer.
- **App València** (Ayuntamiento): módulo temporal que conectaba vecinos de pedanías afectadas con personas y empresas que ofrecían ayuda gratuita.
- **Plataforma del Voluntariado / Som Solidaritat** (Generalitat): registro centralizado de voluntarios. Coordinó más de 14.000 personas desde la Ciudad de las Artes y las Ciencias, con pasajes de bus gratis reservados como entradas de teatro y salidas en horario fijo por tipo de tarea (limpieza, reparto). Consigna: "que nadie vaya por sus propios medios", para no colapsar las rutas de emergencia.
- **DisasterMatters**: app premiada por la Universitat de València, nacida después, para conectar afectados, voluntarios y organismos incluso sin internet.

**Lo que falló:** el primer fin de semana llegaron 10.000 voluntarios sin destino. Buses perdían tiempo buscando dónde intervenir, la gente no sabía qué tarea hacer. Había mucha ayuda y poca información sobre **dónde** y **qué**. Además, varias plataformas paralelas sin compartir datos.

## Incendios de Viña del Mar, Chile (febrero 2024)

- Municipio abrió **formulario de voluntarios** por tipo de trabajo y bloques horarios de 2 a 3 horas, con punto de encuentro fijo.
- **Pre-registro digital de damnificados**: el vecino describe daño, adjunta fotos y georreferencia su casa, para planificar rutas y priorizar casos urgentes antes de la visita oficial.
- Minvu usó **Esri Field Maps** para georreferenciar daño con fotos y observaciones en terreno.
- Problema conocido: casas en campamentos que no aparecían en el catastro oficial quedaron fuera de las ayudas.

## Terremoto de Turquía y Siria (febrero 2023)

- **Afet Harita** ("mapa del desastre"): proyecto open source armado en horas por cientos de desarrolladores organizados en Discord. Extraía pedidos de ayuda publicados en Twitter e Instagram, los geolocalizaba con IA y los mostraba en un mapa para equipos de rescate. Llegó a miles de contribuidores; gestionaban el trabajo con GitHub Projects.
- Lección: se puede construir algo útil muy rápido si el alcance es estrecho, y la información ya existe dispersa en redes sociales.

## Sismo de México (septiembre 2017)

- **#Verificado19S**: el foco no fue solo recopilar, sino **verificar**. Más de 500 voluntarios en dos roles: *monitores* en terreno que confirmaban qué se necesitaba, y *nodos* frente a la computadora que vigilaban chats vecinales y redes. En 10 días procesaron más de 20.000 datos y unificaron 8 mapas.
- Mostraba qué **faltaba y qué sobraba** en cada centro de acopio, lo que evitó que se acumularan donaciones inútiles.

## Plataformas open source existentes

- **Crisis Cleanup** (Estados Unidos): **el referente más cercano a Aluvia.** Organizaciones de voluntarios registran cada casa afectada (*worksite*) con sus trabajos (*work types*: barro, árboles, techo, comida); todo aparece en un mapa compartido, cualquier organización puede **tomar** (*claim*) un trabajo y cambiar su estado para que la siguiente sepa dónde quedó. Más de 4,7 millones de horas voluntarias coordinadas. El cliente web (Vue 3 + Leaflet, Apache-2.0) es público y activo; **el backend no es público**, así que no se puede autoalojar, y está pensado para EE.UU. y Australia, en inglés.
  - Lo que tomamos: el modelo casa → trabajos → tomado/no tomado → estado, y su catálogo de estados como base del nuestro (ver `03-lecciones-y-requisitos.md`).
  - Lo que evitamos: su paleta de estados vivió años como 20 colores hex sueltos y tuvo que migrarse a tokens. Aluvia parte con tokens (ADR 0004).
- **Ushahidi** (Kenia, 2008): crowdsourcing de reportes en un mapa. Fuerte en recolección y visualización.
- **Sahana Eden**: gestión de voluntarios, inventario, albergues y personas desaparecidas. Fuerte en gestión, más pesado de operar.

Ninguna se puede desplegar y adaptar al español y a Las Condes en días: Crisis Cleanup no publica su backend, y Ushahidi y Sahana son plataformas grandes para un problema acotado. Construimos algo chico tomando el modelo de Crisis Cleanup.

## Fuentes

- [Valencia: App València para la DANA](https://www.valencia.es/cas/actualidad/-/content/app-contactos-dana)
- [El Español: cómo se coordinó a 14.000 voluntarios](https://www.elespanol.com/alicante/20241107/coordinan-voluntarios-ayudar-dana-valencia-nadie-vaya-propios-medios/899160239_0.html)
- [El Triangle: caos y frustración en el voluntariado](https://www.eltriangle.eu/es/2024/11/02/caos-y-frustracion-en-el-voluntariado-de-ayuda-en-valencia-tras-la-dana/)
- [Arquitectura y Diseño: AyudaTerreta y canales de ayuda](https://www.arquitecturaydiseno.es/general/como-ayudar-a-victimas-dana-valencia-donaciones-voluntarios-y-canales-oficiales_11135)
- [Valencia Plaza: DisasterMatters](https://valenciaplaza.com/valenciaplaza/comunitat-valenciana1/la-app-surgida-tras-la-dana-para-conectar-sin-internet-a-voluntarios-con-afectados-y-organismos-tras-una-catastrofe)
- [Puranoticia: plataforma de catastro en Viña del Mar](https://puranoticia.pnt.cl/region-valparaiso/vina-del-mar-habilita-plataforma-digital-para-agilizar-catastro-de)
- [SERVIU RM: Field Maps tras incendios](https://serviumetropolitana.minvu.gob.cl/noticia/asentamientos-precarios-de-serviurm-colaboro-con-aplicacion-de-catastro-tras-incendios-en-vina-del-mar-y-quilpue/)
- [CIPER: casas fuera del catastro](https://www.ciperchile.cl/2024/02/19/incendios-en-valparaiso-aun-no-se-define-ayuda-para-reconstruir-casas-de-campamentos-que-no-figuran-en-catastro-del-minvu/)
- [Euronews: Afet Harita](https://www.euronews.com/next/2023/02/10/how-twitter-helped-find-survivors-trapped-beneath-rubble-after-turkeys-earthquakes)
- [GitHub: afetharita-roadmap](https://github.com/acikyazilimagi/afetharita-roadmap)
- [Infoactivismo: #Verificado19S](https://infoactivismo.org/verificado19s-y-su-labor-de-verificacion-en/)
- [SocialTIC: tecnología y datos ante el sismo](https://socialtic.org/blog/tecnologia-datos-y-participacion-ante-el-sismo-en-mexico/)
- [Crisis Cleanup: cómo funciona (GovTech)](https://www.govtech.com/em/disaster/crisis-cleanup-mapping-tool.html)
- [GitHub: crisiscleanup-4-web](https://github.com/CrisisCleanup/crisiscleanup-4-web)
- [Ushahidi y Sahana Eden (paper)](https://www.researchgate.net/publication/261798860_Ushahidi_and_Sahana_Eden_Open-Source_Platforms_to_Assist_Disaster_Relief_Geospatial_Components_and_Capabilities)
