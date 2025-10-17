const complianceConfig = require('./whatsapp-compliance-config');

/**
 * Validador de mensajes para cumplimiento de WhatsApp Business
 */
class MessageValidator {
  constructor() {
    this.config = complianceConfig;
  }

  /**
   * Valida si un mensaje cumple con las mejores prácticas
   * @param {string} message - Mensaje a validar
   * @param {string} to - Número de destino
   * @returns {object} - Resultado de validación
   */
  validateMessage(message, to) {
    const result = {
      isValid: true,
      warnings: [],
      errors: [],
      suggestions: []
    };

    // Verificar palabras prohibidas
    const forbiddenWords = this.config.messages.forbiddenWords;
    const lowerMessage = message.toLowerCase();
    
    forbiddenWords.forEach(word => {
      if (lowerMessage.includes(word.toLowerCase())) {
        result.warnings.push(`Palabra potencialmente problemática detectada: "${word}"`);
        result.suggestions.push(`Considera reemplazar "${word}" por una alternativa más neutra`);
      }
    });

    // Verificar longitud del mensaje
    if (message.length > 1000) {
      result.warnings.push('Mensaje muy largo. Considera dividirlo en múltiples mensajes más cortos.');
    }

    // Verificar múltiples enlaces
    const urlRegex = /(https?:\/\/[^\s]+)/g;
    const urls = message.match(urlRegex) || [];
    
    if (urls.length > this.config.links.maxLinksPerMessage) {
      result.errors.push(`Demasiados enlaces en un mensaje (${urls.length}). Máximo permitido: ${this.config.links.maxLinksPerMessage}`);
      result.isValid = false;
    }

    // Verificar acortadores de URL seguros
    urls.forEach(url => {
      const domain = this.extractDomain(url);
      if (domain && !this.config.links.safeShorteners.some(safe => domain.includes(safe))) {
        result.warnings.push(`URL no reconocida como segura: ${domain}. Considera usar un acortador confiable.`);
      }
    });

    // Verificar uso excesivo de mayúsculas
    const uppercaseRatio = (message.match(/[A-Z]/g) || []).length / message.length;
    if (uppercaseRatio > 0.3) {
      result.warnings.push('Demasiadas mayúsculas. Puede percibirse como agresivo.');
      result.suggestions.push('Usa mayúsculas solo para énfasis ocasional');
    }

    // Verificar emojis excesivos
    const emojiRegex = /[\u{1F600}-\u{1F64F}]|[\u{1F300}-\u{1F5FF}]|[\u{1F680}-\u{1F6FF}]|[\u{1F1E0}-\u{1F1FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]/gu;
    const emojis = message.match(emojiRegex) || [];
    
    if (emojis.length > 5) {
      result.warnings.push(`Muchos emojis detectados (${emojis.length}). Úsalos con moderación.`);
    }

    // Verificar personalización
    if (!message.includes('{name}') && !this.hasPersonalization(message)) {
      result.suggestions.push('Considera personalizar el mensaje con el nombre del cliente');
    }

    return result;
  }

  /**
   * Extrae el dominio de una URL
   * @param {string} url - URL completa
   * @returns {string} - Dominio extraído
   */
  extractDomain(url) {
    try {
      const urlObj = new URL(url);
      return urlObj.hostname;
    } catch (e) {
      return null;
    }
  }

  /**
   * Verifica si el mensaje tiene elementos de personalización
   * @param {string} message - Mensaje a verificar
   * @returns {boolean} - Si tiene personalización
   */
  hasPersonalization(message) {
    const personalizationIndicators = [
      'estimado', 'estimada', 'sr.', 'sra.', 'don', 'doña',
      'cliente', 'usuario', 'amigo', 'amiga'
    ];
    
    const lowerMessage = message.toLowerCase();
    return personalizationIndicators.some(indicator => 
      lowerMessage.includes(indicator)
    );
  }

  /**
   * Sugiere mejoras para un mensaje
   * @param {string} message - Mensaje original
   * @returns {string} - Mensaje mejorado
   */
  improveMessage(message) {
    let improvedMessage = message;

    // Reemplazar palabras problemáticas
    const replacements = {
      'urgente': 'importante',
      'gratis': 'sin costo',
      'promoción especial': 'oferta',
      'haga clic aquí': 'visita el enlace',
      'garantizado': 'confiable'
    };

    Object.entries(replacements).forEach(([bad, good]) => {
      const regex = new RegExp(bad, 'gi');
      improvedMessage = improvedMessage.replace(regex, good);
    });

    return improvedMessage;
  }

  /**
   * Verifica si es un horario apropiado para enviar mensajes
   * @returns {object} - Estado del horario
   */
  checkSchedule() {
    const now = new Date();
    const hour = now.getHours();
    const day = now.getDay(); // 0 = domingo, 6 = sábado
    const config = this.config.schedule;

    const result = {
      isAllowedTime: true,
      isPeakTime: false,
      isWeekend: day === 0 || day === 6,
      recommendations: []
    };

    // Verificar horario permitido
    if (hour < config.allowedHours.start || hour > config.allowedHours.end) {
      result.isAllowedTime = false;
      result.recommendations.push(
        `Horario no recomendado (${hour}:00). Mejor entre ${config.allowedHours.start}:00 y ${config.allowedHours.end}:00`
      );
    }

    // Verificar horarios pico
    const peaks = config.peakHours;
    result.isPeakTime = (
      (hour >= peaks.morning.start && hour <= peaks.morning.end) ||
      (hour >= peaks.afternoon.start && hour <= peaks.afternoon.end) ||
      (hour >= peaks.evening.start && hour <= peaks.evening.end)
    );

    if (result.isPeakTime) {
      result.recommendations.push('Horario pico detectado. Considera reducir la velocidad de envío.');
    }

    if (result.isWeekend) {
      result.recommendations.push('Fin de semana. Considera reducir la frecuencia de mensajes.');
    }

    return result;
  }
}

module.exports = MessageValidator; 