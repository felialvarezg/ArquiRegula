/**
 * Seed: Base de conocimiento normativo chileno para regularización de edificaciones.
 * Contiene fragmentos reales de la Ley General de Urbanismo y Construcciones (LGUC - DFL 458/1975),
 * la Ordenanza General de Urbanismo y Construcciones (OGUC - DS 47/1992) y la
 * Ley de Copropiedad Inmobiliaria (Ley 19.537), además de guías de procesos ante la DOM.
 *
 * Fuentes:
 *  - LGUC: https://www.bcn.cl/leychile/navegar?idNorma=13560
 *  - OGUC: https://www.bcn.cl/leychile/navegar?idNorma=8201
 *  - Ley 19.537: https://www.bcn.cl/leychile/navegar?idNorma=17137
 *
 * Ejecutar con: bun run db:seed
 */
import { db } from "../src/lib/db";
import type { MemoryKind } from "../src/lib/agent/types";

interface SeedDoc {
  title: string;
  source: string;
  article: string;
  category: string;
  content: string;
  keywords: string;
  url?: string;
}

const docs: SeedDoc[] = [
  // ====================================================================
  // LGUC - Ley General de Urbanismo y Construcciones (DFL 458/1975)
  // ====================================================================
  {
    title: "Definición de obra de edificación",
    source: "LGUC",
    article: "Art. 1.1.2",
    category: "Definiciones",
    content:
      "Para los efectos de esta ley se entenderá por: 1) Obra de edificación: la obra consistente en crear, ampliar, modificar o demoler un edificio o instalación, destinada a vivienda, comercio, industria, salud, educación, cultura, deporte, esparcimiento u otros fines. La obra de edificación comprende la obra gruesa y la obra de terminación. 2) Obra de urbanización: la consistente en ejecutar en un terreno las obras de pavimentación, agua potable, alcantarillado, energía eléctrica, gas y otras que sean necesarias para que el terreno sea apto para ser utilizado de conformidad con el instrumento de planificación territorial respectivo.",
    keywords:
      "obra edificación, urbanización, definición, edificar, construir, demolición, ampliación, modificación",
    url: "https://www.bcn.cl/leychile/navegar?idNorma=13560",
  },
  {
    title: "Permiso municipal de edificación y urbanización",
    source: "LGUC",
    article: "Art. 116",
    category: "Permiso",
    content:
      "Toda obra de urbanización o de edificación, salvo las excepciones legales, requerirá permiso de la Dirección de Obras Municipales, previo pago de los derechos que correspondan. El permiso se solicitará acompañando los antecedentes que determine la Ordenanza General. La Municipalidad no podrá exigir otros antecedentes que los establecidos en la ley y la Ordenanza General. El permiso tendrá una vigencia de dos años, plazo dentro del cual deberán iniciarse las obras, y podrá prorrogarse por una sola vez hasta por un año.",
    keywords:
      "permiso municipal, dirección de obras, DOM, vigencia permiso, prorroga, derechos, urbanización edificación",
    url: "https://www.bcn.cl/leychile/navegar?idNorma=13560",
  },
  {
    title: "Regularización de obras construidas sin permiso",
    source: "LGUC",
    article: "Art. 116 bis",
    category: "Regularización",
    content:
      "Las obras construidas sin el permiso a que se refiere el artículo 116, o sin haber dado aviso de las obras exentas de dicho permiso, podrán ser objeto de regularización, para lo cual el propietario deberá solicitar el permiso o reconocer la obra según corresponda, acompañando los antecedentes que determine la Ordenanza General. La regularización de obras construidas sin permiso ni recepción definitiva, conforme al procedimiento establecido en la Ordenanza General, dará origen a la confepción y otorgamiento del certificado de recepción definitiva de la obra.",
    keywords:
      "regularización, obra sin permiso, certificado recepción, reconocimiento obra, legalizar construcción, sin permiso municipal",
    url: "https://www.bcn.cl/leychile/navegar?idNorma=13560",
  },
  {
    title: "Recepción definitiva de obras",
    source: "LGUC",
    article: "Art. 130",
    category: "Recepción",
    content:
      "Una vez totalmente terminadas las obras de urbanización y edificación, el propietario deberá solicitar a la Dirección de Obras Municipales la recepción definitiva de las obras. La Dirección verificará el cumplimiento de las disposiciones legales y de los planos aprobados. Si los antecedentes están correctos, otorgará el certificado de recepción definitiva. El certificado de recepción definitiva de obras de edificación es el único antecedente que acredita que la obra se terminó conforme a los planos aprobados.",
    keywords:
      "recepción definitiva, certificado recepción, termino de obra, recepción municipal, finalización obra, recepción DOM",
    url: "https://www.bcn.cl/leychile/navegar?idNorma=13560",
  },
  {
    title: "Sanciones por infracciones a la ley",
    source: "LGUC",
    article: "Art. 135",
    category: "Sanciones",
    content:
      "Las municipalidades, a través de la Dirección de Obras Municipales, podrán ordenar la paralización o demolición de las obras que se ejecuten sin el permiso correspondiente o en disconformidad con dicho permiso, y aplicar las multas que procedan. Las infracciones a esta ley y a la Ordenanza General serán sancionadas con multas a beneficio municipal. El procedimiento de aplicación de sanciones se sujetará a las normas de la Ley sobre Procedimientos Administrativos.",
    keywords:
      "sanciones, multa, paralización, demolición, infracción, obra ilegal, sanción municipal, multa DOM",
    url: "https://www.bcn.cl/leychile/navegar?idNorma=13560",
  },
  {
    title: "Cambio de destino de un edificio",
    source: "LGUC",
    article: "Art. 142",
    category: "Cambio de destino",
    content:
      "El cambio de destino de un edificio o de una parte de él, requerirá una autorización de la Dirección de Obras Municipales, previa comprobación de que el nuevo destino cumple con las exigencias de la Ordenanza General y del instrumento de planificación territorial. La municipalidad no autorizará el cambio de destino si éste implica un uso prohibido o no permitido en la zonificación correspondiente.",
    keywords:
      "cambio de destino, cambio de uso, autorización DOM, zonificación, uso de suelo, destino edificio",
    url: "https://www.bcn.cl/leychile/navegar?idNorma=13560",
  },

  // ====================================================================
  // OGUC - Ordenanza General de Urbanismo y Construcciones (DS 47/1992)
  // ====================================================================
  {
    title: "Documentos para solicitar permiso de edificación",
    source: "OGUC",
    article: "Art. 5.1",
    category: "Permiso",
    content:
      "El permiso de edificación deberá solicitarse por el propietario ante la Dirección de Obras Municipales acompañando los siguientes antecedentes: 1) Formulario único de edificación suscrito por el propietario y los profesionales responsables; 2) Proyecto de arquitectura, incluyendo planos de planta, elevaciones y cortes; 3) Especificaciones técnicas; 4) Cálculo de estructuras cuando corresponda; 5) Certificado de informaciones previas; 6) Certificado de la fecha de recepción definitiva de las obras de urbanización cuando proceda; 7) Informes de los servicios competentes cuando corresponda (DOM, SERVIU, Serviu Salud, etc.); 8) Comprobante de pago de derechos municipales.",
    keywords:
      "permiso edificación, documentos, formulario único, planos, especificaciones, cálculo estructural, informaciones previas, derechos municipales",
    url: "https://www.bcn.cl/leychile/navegar?idNorma=8201",
  },
  {
    title: "Anteproyecto de edificación",
    source: "OGUC",
    article: "Art. 5.1.1",
    category: "Permiso",
    content:
      "Con el fin de facilitar el proceso de obtención del permiso, el propietario podrá presentar un anteproyecto a la Dirección de Obras Municipales para su revisión preliminar. La DOM emitirá un informe de observaciones que tendrá carácter orientador. La presentación del anteproyecto no constituye un permiso y no autoriza el inicio de obras. El anteproyecto es especialmente recomendable para proyectos complejos o en zonas con restricciones especiales.",
    keywords:
      "anteproyecto, revisión preliminar, observaciones DOM, pre-aprobación, consulta previa, proyecto arquitectura",
    url: "https://www.bcn.cl/leychile/navegar?idNorma=8201",
  },
  {
    title: "Regularización de construcciones existentes",
    source: "OGUC",
    article: "Art. 5.3.1",
    category: "Regularización",
    content:
      "La regularización de las obras de edificación construidas sin permiso se efectuará mediante la presentación a la Dirección de Obras Municipales de los siguientes antecedentes: 1) Formulario único suscrito por el propietario y los profesionales responsables; 2) Planos de arquitectura de la obra tal como fue construida (as-built), firmados por un arquitecto; 3) Memoria explicativa de la obra y de su regularización; 4) Certificado de la fecha de construcción de la obra, emitido por la DOM o por otros medios de prueba; 5) Cálculo estructural cuando corresponda; 6) Informes de los servicios competentes. La Dirección de Obras Municipal verificará que la obra sea regularizable conforme al instrumento de planificación territorial y normas vigentes al momento de su construcción.",
    keywords:
      "regularización, obras sin permiso, planos as-built, memoria explicativa, certificado fecha, cálculo estructural, legalizar obra",
    url: "https://www.bcn.cl/leychile/navegar?idNorma=8201",
  },
  {
    title: "Cambio de destino de obras existentes",
    source: "OGUC",
    article: "Art. 5.3.2",
    category: "Cambio de destino",
    content:
      "El cambio de destino de una obra construida se sujetará al procedimiento de regularización establecido en el artículo 5.3.1, debiendo verificarse el cumplimiento de las normas del nuevo destino, tales como: condiciones de seguridad, dotación de estacionamientos, normas de la Ley General de Salud, normas del Servicio Nacional del Patrimonio Cultural cuando corresponda, y demás exigencias que establezca el instrumento de planificación territorial.",
    keywords:
      "cambio de destino, cambio de uso, regularización cambio, nuevo destino, estacionamientos, seguridad, uso de suelo",
    url: "https://www.bcn.cl/leychile/navegar?idNorma=8201",
  },
  {
    title: "Recepción definitiva de obras en OGUC",
    source: "OGUC",
    article: "Art. 5.6",
    category: "Recepción",
    content:
      "La solicitud de recepción definitiva deberá presentarse a la Dirección de Obras Municipales acompañando: 1) Formulario único de recepción suscrito por el propietario y los profesionales; 2) Planos de la obra ejecutada (as-built); 3) Certificado del revisor independiente o del calculista según corresponda; 4) Informes de los servicios competentes. La DOM verificará que la obra se haya ejecutado conforme a los planos aprobados. En caso de observaciones, el propietario tendrá un plazo para subsanarlas. Una vez corregidas, se otorgará el certificado de recepción definitiva.",
    keywords:
      "recepción definitiva, formulario único, planos as-built, revisor independiente, certificado recepción, observaciones DOM",
    url: "https://www.bcn.cl/leychile/navegar?idNorma=8201",
  },
  {
    title: "Obras que no requieren permiso ni aviso",
    source: "OGUC",
    article: "Art. 5.4",
    category: "Permiso",
    content:
      "No requerirán permiso ni aviso a la Dirección de Obras Municipales las siguientes obras menores: 1) Pintura exterior y reparaciones menores que no afecten la estructura; 2) Instalación de calefactores y equipos de climatización siempre que cumplan con las normas; 3) Reposición de cubiertas y cielos; 4) Construcción de cercos de hasta 2,0 metros de altura en zonas urbanas; 5) Obras interiores de mantención. Estas obras deberán ejecutarse conforme a las normas generales de la Ordenanza.",
    keywords:
      "obra menor, sin permiso, sin aviso, pintura, reparación, cerco, mantención, exención permiso",
    url: "https://www.bcn.cl/leychile/navegar?idNorma=8201",
  },
  {
    title: "Demolición de obras",
    source: "OGUC",
    article: "Art. 5.5",
    category: "Demolición",
    content:
      "La demolición total o parcial de una obra requerirá permiso de la Dirección de Obras Municipales. La solicitud deberá acompañar: 1) Formulario único de demolición; 2) Plano de la obra a demoler; 3) Memoria explicativa del procedimiento de demolición; 4) Medidas de seguridad para obras colindantes y vía pública. La demolición de inmuebles de conservación histórica requerirá además la autorización del Consejo de Monumentos Nacionales o del Servicio Nacional del Patrimonio Cultural.",
    keywords:
      "demolición, permiso demolición, formulario único, planos, medidas seguridad, monumentos nacionales, patrimonio",
    url: "https://www.bcn.cl/leychile/navegar?idNorma=8201",
  },

  // ====================================================================
  // Ley 19.537 - Copropiedad Inmobiliaria
  // ====================================================================
  {
    title: "Obras en bienes de dominio común",
    source: "Ley 19.537",
    article: "Art. 17",
    category: "Copropiedad",
    content:
      "Ningún copropietario podrá realizar obras en los bienes de dominio común sin previa autorización de la asamblea de copropietarios. Las obras que modifiquen los bienes comunes requerirán acuerdo de la asamblea adoptado por las mayorías que establece esta ley. La realización de obras en unidades del condominio que afecten la estructura o servicios comunes deberá ser informada al administrador del condominio.",
    keywords:
      "copropiedad, bienes comunes, asamblea copropietarios, obras condominio, autorización asamblea, dominio común",
    url: "https://www.bcn.cl/leychile/navegar?idNorma=17137",
  },
  {
    title: "Obras en unidades de copropiedad",
    source: "Ley 19.537",
    article: "Art. 18",
    category: "Copropiedad",
    content:
      "Las obras que se ejecuten en una unidad del condominio no podrán afectar la seguridad del inmueble ni los servicios comunes. El comité de administración podrá exigir la presentación de los planos y permisos municipales correspondientes. Toda obra que afecte muros soportantes, estructuras o instalaciones comunes requerirá permiso municipal y autorización de la asamblea.",
    keywords:
      "obra unidad, copropiedad, muros soportantes, estructura común, comité administración, permiso municipal condominio",
    url: "https://www.bcn.cl/leychile/navegar?idNorma=17137",
  },

  // ====================================================================
  // Guías de procesos ante la DOM (documentación y pasos)
  // ====================================================================
  {
    title: "Pasos para regularizar una obra sin permiso ante la DOM",
    source: "Guía DOM",
    article: "Proceso Regularización",
    category: "Guía de proceso",
    content:
      "Procedimiento paso a paso para regularizar una obra construida sin permiso ante la Dirección de Obras Municipales:\n\n1. Solicitar un Certificado de Informaciones Previas en la DOM, que indica la zonificación, rasantes, coeficientes y normas aplicables al predio.\n2. Contratar un arquitecto habilitado, quien deberá elaborar los planos as-built (tal como se construyó) y la memoria explicativa.\n3. Verificar la fecha de construcción mediante el Certificado de Fecha de Construcción o por otros medios de prueba (fotos aéreas, facturas antiguas, declaraciones testimoniales).\n4. El arquitecto elabora el cálculo estructural cuando la obra tenga más de un piso o supere cierta superficie.\n5. Presentar el Formulario Único de Edificación en la DOM junto con todos los antecedentes.\n6. La DOM revisa el expediente (plazo legal de respuesta: 30 días hábiles).\n7. Si hay observaciones, se subsanan y se vuelve a presentar.\n8. Una vez aprobado, se paga el derecho municipal de regularización.\n9. La DOM emite el Certificado de Recepción Definitiva que legaliza la obra.",
    keywords:
      "pasos regularización, certificado informaciones previas, arquitecto, planos as-built, memoria explicativa, certificado fecha, formulario único, derecho municipal, recepción definitiva",
    url: "https://www.bcn.cl/leychile/navegar?idNorma=8201",
  },
  {
    title: "Checklist de documentos para permiso de edificación",
    source: "Guía DOM",
    article: "Checklist Permiso",
    category: "Guía de proceso",
    content:
      "Listado de documentos necesarios para solicitar permiso de edificación nueva ante la DOM:\n\n[ ] Formulario Único de Edificación firmado por propietario y arquitecto\n[ ] Proyecto de arquitectura: planos de plantas, fachadas, cortes y ubicación (E=1:100)\n[ ] Especificaciones técnicas de construcción\n[ ] Memoria de cálculo estructural firmada por ingeniero calculista\n[ ] Planos de estructura\n[ ] Certificado de Informaciones Previas (vigente, máx. 6 meses)\n[ ] Certificado de recepción definitiva de urbanización (si corresponde)\n[ ] Informe del revisor independiente de cálculo estructural (si la altura o superficie lo exige)\n[ ] Comprobante de pago de derechos municipales\n[ ] Adjuntos según destino: informe Sanitario (SEREMI Salud), DMOV (tránsito), DOM (factibilidad de agua/alcantarillado)\n[ ] Si el predio está en zona de protección patrimonial: autorización del Servicio Nacional del Patrimonio Cultural",
    keywords:
      "checklist permiso edificación, formulario único, planos arquitectura, especificaciones, cálculo estructural, informaciones previas, derechos municipales, revisor independiente",
    url: "https://www.bcn.cl/leychile/navegar?idNorma=8201",
  },
  {
    title: "Checklist de documentos para regularización de obra existente",
    source: "Guía DOM",
    article: "Checklist Regularización",
    category: "Guía de proceso",
    content:
      "Listado de documentos necesarios para regularizar una obra construida sin permiso ante la DOM:\n\n[ ] Formulario Único de Edificación (sección regularización) firmado por propietario y arquitecto\n[ ] Memoria explicativa de la obra y de la regularización, describiendo la fecha aproximada de construcción, el origen y estado actual\n[ ] Planos de arquitectura as-built (planta, fachadas, cortes) firmados por arquitecto\n[ ] Certificado de Fecha de Construcción emitido por la DOM (o medios de prueba alternativos: fotos aéreas del SAF, facturas, testigos)\n[ ] Cálculo estructural cuando la obra supere los 60 m² construidos o tenga más de un piso\n[ ] Certificado de Informaciones Previas vigente\n[ ] Informe de la Sanidad (SEREMI Salud) si el destino es comercio, industria o salud\n[ ] Informe de la DOM sobre factibilidad de servicios sanitarios\n[ ] Si la obra está en zona de conservación histórica: informe del Servicio Nacional del Patrimonio Cultural\n[ ] Comprobante de pago del derecho municipal de regularización (calculado sobre el valor de la obra según tabla DOM)",
    keywords:
      "checklist regularización, memoria explicativa, planos as-built, certificado fecha construcción, cálculo estructural, informaciones previas, derechos municipal, patrimonio cultural",
    url: "https://www.bcn.cl/leychile/navegar?idNorma=8201",
  },
  {
    title: "Memoria explicativa para regularización - estructura recomendada",
    source: "Guía DOM",
    article: "Plantilla Memoria",
    category: "Plantilla",
    content:
      "Estructura recomendada para la memoria explicativa en procesos de regularización de obras:\n\n1. ANTECEDENTES GENERALES\n   - Nombre del propietario, rol de avalúo, dirección, comuna.\n   - Ubicación y datos del predio (superficie, dimensiones).\n\n2. ANTECEDENTES DE LA OBRA\n   - Descripción de la obra a regularizar (uso, superficie construida, número de pisos, materiales).\n   - Fecha aproximada de construcción y medios de prueba.\n   - Estado de conservación actual.\n\n3. MARCO NORMATIVO APLICABLE\n   - Instrumento de planificación territorial vigente (Plan Regulador Comunal).\n   - Zonificación y normas de edificación aplicables.\n   - Normativa sectorial (salud, patrimonio, vivienda).\n\n4. CUMPLIMIENTO NORMATIVO\n   - Verificación de coeficientes de constructibilidad y ocupación de suelo.\n   - Cumplimiento de rasantes, adosamientos y antejardines.\n   - Dotación de estacionamientos según OGUC.\n   - Condiciones de seguridad estructural.\n\n5. CONCLUSIÓN\n   - Declaración de que la obra es susceptible de regularización.\n   - Firma del arquitecto responsable.",
    keywords:
      "memoria explicativa, plantilla, estructura memoria, regularización, antecedentes, marco normativo, cumplimiento, conclusión arquitecto",
    url: "https://www.bcn.cl/leychile/navegar?idNorma=8201",
  },
  {
    title: "Costos y derechos municipales en regularización",
    source: "Guía DOM",
    article: "Costos DOM",
    category: "Guía de proceso",
    content:
      "Los derechos municipales por regularización de obras se calculan según la ordenanza municipal de cobros de cada comuna, generalmente como un porcentaje del valor de la obra (definido por la Ley de Rentas Municipales N° 21.197 y la ordenanza de cobros local). En líneas generales:\n\n- Derecho de permiso o regularización de edificación: 0,5% a 1% del valor de la obra (varía por comuna).\n- Derecho de recepción definitiva: tarifa fija según superficie.\n- Inspecciones municipales: tarifa por hora del inspector.\n- Certificado de informaciones previas: tarifa fija (aprox. 0,1 a 0,3 UTM).\n- Certificado de fecha de construcción: tarifa fija.\n\nSe recomienda consultar la ordenanza de cobros de la municipalidad respectiva, ya que los montos difieren significativamente entre comunas.",
    keywords:
      "derechos municipales, costo regularización, ordenanza cobros, valor obra, renta municipal, UTM, tarifa DOM, inspección",
    url: "https://www.bcn.cl/leychile/navegar?idNorma=1167644",
  },
  {
    title: "Regularización en zonas de conservación histórica",
    source: "Guía DOM",
    article: "Patrimonio",
    category: "Patrimonio",
    content:
      "Cuando la obra a regularizar se ubica en una Zona Típica o de Conservación Histórica, o es inmueble de conservación histórica, se requiere adicionalmente:\n\n1. Informe favorable del Servicio Nacional del Patrimonio Cultural (ex Consejo de Monumentos).\n2. Para Inmuebles de Conservación Histórica (ICH) declarados por la Ley 17.288: autorización previa del Consejo de Monumentos Nacionales.\n3. El proyecto de regularización debe respetar las características arquitectónicas y patrimoniales del inmueble o zona.\n4. Las modificaciones estructurales o de fachadas requieren dictamen de un arquitecto especialista en patrimonio.\n5. El plazo de revisión por el Servicio de Patrimonio puede extender el trámite en hasta 60 días adicionales.",
    keywords:
      "zona típica, conservación histórica, patrimonio cultural, monumentos nacionales, ICH, Ley 17288, arquitectura patrimonio",
    url: "https://www.bcn.cl/leychile/navegar?idNorma=28881",
  },
  {
    title: "Revisor independiente de proyectos (RIP)",
    source: "OGUC",
    article: "Art. 5.1.5",
    category: "Permiso",
    content:
      "Para ciertos proyectos de envergadura, la OGUC exige la participación de un Revisor Independiente de Proyectos (RIP) y/o Revisor Independiente de Cálculo Estructural (RICE), quienes verifican el cumplimiento normativo del proyecto y emiten un informe. Se requiere RIP cuando: la altura de la edificación supere los 5 pisos o 15 metros; la superficie construida supere los 1.000 m²; se trate de edificios de uso público con alta concentración de personas. El informe del RIP es un antecedente obligatorio para el permiso.",
    keywords:
      "revisor independiente, RIP, RICE, cálculo estructural, verificación proyecto, informe RIP, edificación envergadura, altura superficie",
    url: "https://www.bcn.cl/leychile/navegar?idNorma=8201",
  },
  {
    title: "Definición de coeficientes y rasantes",
    source: "OGUC",
    article: "Art. 2.1",
    category: "Definiciones",
    content:
      "Definiciones clave de la OGUC:\n\n- Coeficiente de Constructibilidad (COS): relación entre la superficie total edificada y la superficie del terreno.\n- Coeficiente de Ocupación de Suelo (COS-suelo): relación entre la proyección horizontal de la edificación y la superficie del terreno.\n- Rasante: línea imaginaria que parte desde el nivel del terreno y se eleva formando un ángulo, limitando la altura máxima que puede alcanzar la edificación en cada punto del predio.\n- Antejardín: espacio libre entre la línea de edificación y la línea oficial de la calle.\n- Densidad: número máximo de viviendas por hectárea permitido en el predio.\nEstos parámetros son fijados por el Plan Regulador Comunal o Metropolitano para cada zona.",
    keywords:
      "coeficiente constructibilidad, ocupación suelo, rasante, antejardín, densidad, plan regulador, COS, parámetros edificación",
    url: "https://www.bcn.cl/leychile/navegar?idNorma=8201",
  },
];

async function main() {
  console.log(`Plantando ${docs.length} documentos normativos...`);

  // Limpia documentos previos para evitar duplicados si se corre varias veces
  await db.knowledgeDocument.deleteMany({});

  for (const doc of docs) {
    await db.knowledgeDocument.create({
      data: {
        title: doc.title,
        source: doc.source,
        article: doc.article,
        category: doc.category,
        content: doc.content,
        keywords: doc.keywords,
        url: doc.url,
      },
    });
  }

  const count = await db.knowledgeDocument.count();
  console.log(`✓ Base de conocimiento poblada con ${count} documentos.`);

  // ---------------------------------------------------------------------------
  // Sembrar memoria a largo plazo (IL2.2)
  // ---------------------------------------------------------------------------
  await seedMemory();
}

/** Sembra de hechos de ejemplo en memoria a largo plazo. */
async function seedMemory() {
  const cases = [
    {
      content: "Caso 1 — Ampliación de vivienda sin permiso, comuna de Ñuñoa, superficie 45 m². Propietario: María González Pérez.",
      kind: "case",
      metadata: { source: "demo_case", turn: 1 },
    },
    {
      content: "El usuario prefiere explicaciones paso a paso y revisa siempre la normativa citada antes de firmar el documento final.",
      kind: "preference",
      metadata: { source: "demo_case", turn: 1 },
    },
    {
      content: "Antes de generar la memoria explicativa se deben citar LGUC Art. 116 bis y OGUC Art. 5.3.1.",
      kind: "summary",
      metadata: { source: "demo_session", turn: 1 },
    },
  ];

  const memory = await db.memoryEntry.createMany({
    data: cases.map((c) => ({
      sessionId: null,
      kind: c.kind as MemoryKind,
      content: c.content,
      metadata: JSON.stringify(c.metadata),
    })),
  });

  console.log(`✓ Memoria a largo plazo sembrada con ${memory.count} hechos de ejemplo.`);
}

main()
  .catch((e) => {
    console.error("Error poblando base de conocimiento:", e);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
  });
