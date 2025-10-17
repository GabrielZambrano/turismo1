/**
 * Configuración de cumplimiento para WhatsApp Business
 * Basado en las mejores prácticas y recomendaciones oficiales
 * Actualizado: Enero 2025
 */

const whatsappComplianceConfig = {
  // Control de velocidad de mensajes
  messaging: {
    messagesPerMinute: 3,        // Máximo recomendado: 3-4 mensajes por minuto
    maxDailyMessages: 150,       // Límite diario conservador
    pauseBetweenBatches: 60000,  // 1 minuto entre lotes de 10 mensajes
    batchSize: 10,               // Tamaño del lote antes de pausa larga
    
    // Pausas progresivas para evitar detección
    baseDelay: 20000,            // 20 segundos base entre mensajes
    increasedDelay: 60000,       // 1 minuto después de lotes
    peakHourDelay: 30000         // Pausa adicional en horarios pico
  },

  // Sistema anti-spam
  antiSpam: {
    maxRecentMessages: 5,        // Número de mensajes recientes a recordar
    similarityThreshold: 0.8,    // 80% de similitud para considerar spam
    cooldownPeriod: 300000,      // 5 minutos de espera entre mensajes similares
    maxMessagesPerContact: 3     // Máx mensajes por contacto por hora
  },

  // Horarios recomendados (hora local)
  schedule: {
    allowedHours: {
      start: 8,    // 8:00 AM
      end: 20      // 8:00 PM
    },
    peakHours: {
      morning: { start: 9, end: 11 },    // 9:00-11:00 AM
      afternoon: { start: 14, end: 16 }, // 2:00-4:00 PM
      evening: { start: 18, end: 20 }    // 6:00-8:00 PM
    },
    weekendReduction: 0.5  // Reducir 50% la velocidad en fines de semana
  },

  // Mensajes seguros y profesionales
  messages: {
    // Evitar palabras que pueden ser marcadas como spam
    forbiddenWords: [
      'urgente', 'gratis', 'promoción especial', 'oferta limitada',
      'haga clic aquí', 'garantizado', '100% seguro', 'dinero fácil'
    ],
    
    // Plantillas profesionales recomendadas
    templates: {
      greeting: [
        '¡Hola {name}! Gracias por contactarnos.',
        'Buenos días {name}, es un placer atenderte.',
        'Saludos {name}, ¿en qué podemos ayudarte?'
      ],
      serviceConfirmation: [
        'Hemos recibido tu solicitud, {name}. Procesando...',
        'Confirmado {name}. Tu solicitud está siendo atendida.',
        'Perfecto {name}. Estamos gestionando tu pedido.'
      ]
    }
  },

  // URLs y enlaces seguros
  links: {
    // Usar acortadores de URL reconocidos
    safeShorteners: [
      'bit.ly', 'tinyurl.com', 'bl.ink', 'short.link',
      'cutt.ly', 'ow.ly', 'is.gd', 't.co'
    ],
    // Evitar múltiples enlaces en un solo mensaje
    maxLinksPerMessage: 1,
    // Agregar contexto a los enlaces
    addLinkContext: true
  },

  // Gestión de contactos
  contacts: {
    // Animar a guardar el contacto
    saveContactReminder: true,
    saveContactMessage: 'Para recibir nuestras notificaciones importantes, te recomendamos guardar este número en tus contactos como "Taxi Turismo".',
    
    // Facilitar la baja
    unsubscribeOption: true,
    unsubscribeMessage: 'Si deseas dejar de recibir mensajes, responde "BAJA" en cualquier momento.'
  },

  // Monitoreo y alertas
  monitoring: {
    trackMessageDelivery: true,
    alertOnHighFailureRate: true,
    failureRateThreshold: 0.1,  // 10% de fallos
    generateDailyReport: true
  }
};

module.exports = whatsappComplianceConfig; 