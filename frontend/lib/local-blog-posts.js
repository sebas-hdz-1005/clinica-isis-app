function text(value) {
  return {
    nodeType: 'text',
    value,
    marks: [],
    data: {}
  };
}

function paragraph(value) {
  return {
    nodeType: 'paragraph',
    data: {},
    content: [text(value)]
  };
}

function heading(level, value) {
  return {
    nodeType: `heading-${level}`,
    data: {},
    content: [text(value)]
  };
}

function listItem(value) {
  return {
    nodeType: 'list-item',
    data: {},
    content: [paragraph(value)]
  };
}

function unorderedList(items) {
  return {
    nodeType: 'unordered-list',
    data: {},
    content: items.map((item) => listItem(item))
  };
}

const privacyPolicyContent = {
  nodeType: 'document',
  data: {},
  content: [
    paragraph(
      'Version editorial adaptada para el blog institucional a partir de la politica de privacidad y tratamiento de datos personales publicada por Clinica Isis.'
    ),
    heading(2, 'Introduccion'),
    paragraph(
      'Clinica Isis mantiene una politica de tratamiento de datos personales orientada por los principios de legalidad, confidencialidad, disponibilidad, integridad y uso responsable de la informacion.'
    ),
    paragraph(
      'El objetivo de esta version digital es explicar, en un lenguaje mas claro, como se recolectan, usan, protegen y atienden los datos personales de pacientes, usuarios, proveedores, colaboradores y terceros vinculados con la institucion.'
    ),
    heading(2, 'Finalidad del tratamiento'),
    paragraph(
      'Los datos personales pueden usarse para la prestacion de servicios de salud, la gestion administrativa y financiera, el seguimiento de pacientes, el agendamiento, la validacion de identidad y el cumplimiento de obligaciones legales y contractuales.'
    ),
    unorderedList([
      'Gestionar citas, consultas, procedimientos, contactos y seguimiento asistencial.',
      'Compartir informacion operativa sobre servicios, novedades, cambios, promociones o campañas autorizadas.',
      'Desarrollar procesos de facturacion, recaudo, cartera, verificaciones y medios de pago.',
      'Ejecutar analitica, indicadores de calidad, encuestas y acciones de mejora continua.'
    ]),
    heading(2, 'Principios y alcance'),
    paragraph(
      'La politica aplica a las bases de datos administradas por Clinica Isis en el desarrollo de sus actividades asistenciales, comerciales, laborales y de apoyo. El tratamiento debe realizarse con proposito legitimo, seguridad adecuada y acceso limitado a quien realmente lo necesita.'
    ),
    unorderedList([
      'Solo se recolecta la informacion necesaria para la finalidad informada.',
      'Los datos deben mantenerse actualizados, completos y protegidos.',
      'El acceso interno y externo debe respetar los niveles de autorizacion definidos por la clinica.',
      'La informacion sensible y la relacionada con menores requiere especial cuidado y proteccion.'
    ]),
    heading(2, 'Derechos del titular'),
    paragraph(
      'Toda persona titular de datos personales puede conocer, actualizar, rectificar y solicitar prueba de la autorizacion otorgada, asi como presentar consultas o reclamos sobre el uso de su informacion.'
    ),
    unorderedList([
      'Solicitar informacion sobre los datos almacenados.',
      'Pedir correccion, actualizacion o supresion cuando proceda.',
      'Revocar la autorizacion en los casos permitidos por la ley.',
      'Recibir respuesta a consultas y reclamos por los canales definidos por la institucion.'
    ]),
    heading(2, 'Deberes de Clinica Isis'),
    paragraph(
      'La institucion debe custodiar la informacion, usarla de manera adecuada, permitir el ejercicio de derechos de los titulares y adoptar medidas administrativas, tecnicas y humanas para evitar perdida, uso no autorizado, alteracion o divulgacion indebida.'
    ),
    heading(2, 'Recoleccion, manejo y seguridad'),
    paragraph(
      'Los datos pueden ser recolectados de manera presencial, telefonica o digital mediante formularios, historia clinica, procesos de vinculacion, autorizaciones, plataformas, canales de servicio y otros mecanismos asociados a la operacion.'
    ),
    paragraph(
      'Clinica Isis informa que implementa medidas de privacidad, reserva y seguridad para proteger las bases de datos bajo su administracion. Esto incluye controles de acceso, deberes de confidencialidad y procedimientos para el tratamiento responsable de la informacion.'
    ),
    heading(2, 'Consultas y reclamos'),
    paragraph(
      'Los titulares pueden presentar consultas y reclamos por los canales oficiales de la clinica para conocer el estado de su informacion o solicitar correcciones. La atencion de estas solicitudes debe seguir los tiempos y requisitos establecidos por la normatividad de habeas data.'
    ),
    heading(2, 'Canales institucionales'),
    paragraph(
      'De acuerdo con la politica publicada por Clinica Isis, la institucion mantiene canales de contacto para atender estos asuntos, incluyendo su sede principal en Medellin y los medios oficiales publicados en su sitio web.'
    ),
    heading(2, 'Vigencia y legislacion aplicable'),
    paragraph(
      'La politica se enmarca en la legislacion colombiana sobre habeas data y proteccion de datos personales, especialmente las Leyes 1266 de 2008 y 1581 de 2012, junto con sus decretos reglamentarios y actualizaciones aplicables.'
    ),
    paragraph(
      'Para consultar la version completa y oficial, se recomienda revisar siempre la publicacion vigente en el portal institucional de Clinica Isis.'
    )
  ]
};

const localBlogPosts = [
  {
    id: 'local-politica-de-privacidad',
    title: 'Politica de privacidad y tratamiento de datos personales',
    slug: 'politica-de-privacidad',
    urlPath: '/blog/politica-de-privacidad/',
    absoluteUrl: '',
    content: privacyPolicyContent,
    createdAt: '2026-06-30T00:00:00Z',
    excerpt:
      'Consulta una version clara y ordenada de la politica de privacidad de Clinica Isis, sus finalidades, derechos del titular y canales de atencion.',
    readingTime: '4 min',
    category: 'Politicas institucionales',
    image: null
  }
];

module.exports = {
  localBlogPosts
};
