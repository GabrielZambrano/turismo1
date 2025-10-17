const { Client, MessageMedia, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const QRCode = require('qrcode');
const path = require('path');
const fs = require('fs');
const axios = require('axios');
const stringSimilarity = require('string-similarity');
const config = require('./config');
const dotenv = require('dotenv');
const request = require('request');
const admin = require('firebase-admin');
const { v4: uuidv4 } = require('uuid');
const MessageValidator = require('./message-validator');

dotenv.config();
const serviceAccount = require('../bd.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});
// Configuración del entorno
const { NODE_ENV = 'development' } = process.env;
const isProduction = NODE_ENV === 'production';
const directoryPath = path.join(__dirname, 'pedidos');

// Funciones para manejar archivos de conversación
function crearArchivoConversacion(telefono) {
  const filePath = path.join(directoryPath, `${telefono}.json`);
  
  // Crear archivo con información del puerto si no existe
  if (!fs.existsSync(filePath)) {
    const archivoConversacion = {
      puerto: port.toString(),
      fechaCreacion: new Date().toISOString(),
      estado: "activo"
    };
    
    fs.writeFileSync(filePath, JSON.stringify(archivoConversacion, null, 2), 'utf8');
    console.log(`📁 Archivo de conversación creado: ${telefono}.json con puerto ${port}`);
    
    // Programar eliminación automática en 15 minutos
    setTimeout(() => {
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
        console.log(`🗑️ Archivo de conversación eliminado automáticamente: ${telefono}.json`);
      }
    }, 900000); // 900 segundos = 15 minutos
  }
}

function verificarArchivoConversacion(telefono) {
  const filePath = path.join(directoryPath, `${telefono}.json`);
  return fs.existsSync(filePath);
}

function obtenerPuertoDelArchivoConversacion(telefono) {
  const filePath = path.join(directoryPath, `${telefono}.json`);
  
  if (!fs.existsSync(filePath)) {
    return null;
  }
  
  try {
    const data = fs.readFileSync(filePath, 'utf8');
    const archivoConversacion = JSON.parse(data);
    return archivoConversacion.puerto || null;
  } catch (error) {
    console.error(`Error al leer el archivo de conversación ${telefono}.json:`, error);
    return null;
  }
}

async function obtenerNombreClienteDesdeBD(telefono) {
  try {
    const clientesRef = admin.firestore().collection('clientestelefonos1');
    const clienteSnapshot = await clientesRef.where('telefono', '==', telefono).get();
    
    if (!clienteSnapshot.empty) {
      const clienteDoc = clienteSnapshot.docs[0];
      const clienteData = clienteDoc.data();
      return clienteData.nombre || null;
    }
    return null;
  } catch (error) {
    console.error(`Error al obtener nombre del cliente ${telefono}:`, error);
    return null;
  }
}

// Clase principal
const db = admin.firestore();
const port = 3005;
const empresa = "Taxi Turismo Sangolqui";
const grupounidades = "593994561601-1468369445@g.us";  // ID del grupo de WhatsApp
const grupadmin = "593994561601-1468369445@g.us";  // ID del grupo de WhatsApp

const mysql = require('mysql2/promise'); // Usar la versión promise
const dbConfig = {
  host: 'localhost',
  user: 'root',
  password: '',
  database: 'chasqui210722'
};
async function connectToDatabase() {
  try {
    const connection = await mysql.createConnection(dbConfig);
    console.log('Conectado a la base de datos MySQL.');
    return connection;
  } catch (err) {
    console.error('Error al conectar con la base de datos:', err);
    throw err;
  }
}
const userId = 100; // Definir userId explícitamente para evitar problemas de paso de parámetros
// Función para escuchar cuando se elimina un registro de la colección 'pedidoEnCurso'
async function escucharEliminacionPedidoEnCurso() {
  try {
    const connection = await connectToDatabase();
    db.collection('pedidoEnCurso').onSnapshot(snapshot => {
      snapshot.docChanges().forEach(async change => {
        if (change.type === 'removed') {
          const pedidoData = change.doc.data();
          const docId = change.doc.id;

          // Mostrar los datos del pedido eliminado en la consola
          console.log(`Pedido eliminado: ${docId}`, pedidoData);

          const querySelect = "SELECT `id`, `APP` FROM `usuarios` WHERE `id` = 100";
          const queryUpdate = "UPDATE `usuarios` SET `APP` = `APP` + 1 WHERE `id` = 100";
        
          try {
            console.log('Ejecutando consulta SELECT para verificar existencia del usuario...');
            const [results] = await connection.execute(querySelect);
            console.log('Resultados de la consulta SELECT:', results);
            if (results.length > 0) {
              console.log('Usuario encontrado, ejecutando consulta UPDATE...');
              await connection.execute(queryUpdate);
              console.log(`El valor de APP para el usuario con ID ${userId} ha sido incrementado.`);
            } else {
              console.log('Usuario no encontrado. No se realizó ninguna actualización.');
            }
          } catch (err) {
            console.error('Error al interactuar con la base de datos:', err);
          }
        }
      });
    }, error => {
      console.error('Error al escuchar los cambios en pedidoEnCurso:', error);
    });
  } catch (err) {
    console.error('Error al conectar a la base de datos para escuchar los cambios:', err);
  }
}
escucharEliminacionPedidoEnCurso();



async function syncPedidoEnCursoToDetallesDeViajes() {
  db.collection('pedidoEnCurso').onSnapshot(snapshot => {
    snapshot.docChanges().forEach(async change => {
      if (change.type === 'added') {
        const pedidoData = change.doc.data();
        const docId = change.doc.id;

        const {
          foto, telefono, telefonoConductor, unidad, placa,
          color, nombre, minutos
        } = pedidoData;

        try {
          // Guardar el nuevo pedido en la colección "detallesDeViajes" con el mismo ID
          await db.collection('detallesDeViajes').doc(docId).set(pedidoData);
          console.log(`Pedido ${docId} guardado en detallesDeViajes.`);

          // Actualizar el estado del archivo JSON a "Aceptado"
          actualizarEstadoArchivo(telefono, "Aceptado");

          // Enviar el mensaje con la información del conductor y la placa
          if (telefono.length >= 10) {
            await enviarMensajeDetallesDeViaje(telefono, telefonoConductor, unidad, placa, color, minutos, nombre, foto, pedidoData.puerto);
          } else {
            console.log(`Número de teléfono ${telefono} no válido para enviar mensaje.`);
          }

        } catch (error) {
          console.error(`Error al guardar el pedido ${docId} en detallesDeViajes o en solicitud1:`, error);
        }

      } else if (change.type === 'removed') {
        const pedidoData = change.doc.data();
        const docId = change.doc.id;
        const { telefono, telefonoConductor, randon, idConductor, unidad, nombre, placa, color, foto } = pedidoData;

        // Mostrar los datos del pedido eliminado en la consola
        console.log(`Pedido eliminado: ${docId}`, pedidoData);

        // Enviar el mensaje de pedido finalizado
        if (telefono.length >= 10) {
          await enviarMensajePedidoFinalizado(telefono, randon, unidad, nombre, color, placa, foto, telefonoConductor, pedidoData.puerto);
        } else {
          console.log(`Número de teléfono ${telefono} no válido para enviar mensaje.`);
        }

       
      } else if (change.type === 'modified') {
        const pedidoData = change.doc.data();
        const { telefono, pedido, llegue, latitudConductor, longitudConductor } = pedidoData;

        // Verificar el nuevo estado del pedido
        if (pedido === 'Iniciado') {
          if (telefono.length >= 10) {
       ///     await enviarMensajeEstadoPedido(telefono, 'Su pedido ha sido iniciado.');
          } else {
            console.log(`Número de teléfono ${telefono} no válido para enviar mensaje.`);
          }
        } else if (llegue === true) {
          if (telefono.length >= 10) {
         ///   await enviarMensajeEstadoPedido(telefono, `El conductor ha llegado a su ubicación. Ubicación del conductor: [Ver en Google Maps](https://www.google.com/maps?q=${latitudConductor},${longitudConductor})`);
          } else {
            console.log(`Número de teléfono ${telefono} no válido para enviar mensaje.`);
          }
        }
      }
    });
  }, error => {
    console.error('Error al obtener los datos:', error);
  });
}
// Función para actualizar el estado del archivo JSON
function actualizarEstadoArchivo(telefono, nuevoEstado) {
  const filePath = path.join(directoryPath, `${telefono}.json`);
  
  fs.readFile(filePath, 'utf8', (err, data) => {
    if (err) {
      console.error(`Error al leer el archivo ${filePath}:`, err);
      return;
    }
    
    try {
      const fileData = JSON.parse(data);
      fileData.estado = nuevoEstado;
      
      fs.writeFile(filePath, JSON.stringify(fileData, null, 2), (err) => {
        if (err) {
          console.error(`Error al escribir en el archivo ${filePath}:`, err);
        } else {
          console.log(`Estado del archivo ${filePath} actualizado a ${nuevoEstado}.`);
        }
      });
    } catch (parseError) {
      console.error(`Error al parsear los datos del archivo ${filePath}:`, parseError);
    }
  });
}


async function syncPedidosDisponiblesListener() {
  db.collection('pedidosDisponibles1').onSnapshot(snapshot => {
    snapshot.docChanges().forEach(async change => {
      if (change.type === 'added') {
        const pedidoData = change.doc.data();
        const docId = change.doc.id;
        console.log(`Nuevo pedido disponible añadido con ID: ${docId}`, pedidoData);
        
        // Aquí podrías agregar lógica adicional para procesar el nuevo pedido disponible
        if (pedidoData.valor.includes('CENTRAL')) {







          setTimeout(() => {
            db.collection('pedidosDisponibles1').doc(docId).update({ rango: '5' })
              .then(() => console.log(`Rango actualizado a 8 para el pedido con ID: ${docId}`))
              .catch(error => console.error('Error al actualizar el rango:', error));
          }, 20000); // 20 segundos
        }



      }
    });
  }, error => {
    console.error('Error al obtener los pedidos disponibles:', error);
  });
}

// Función para enviar el mensaje con los detalles del viaje
async function enviarMensajeDetallesDeViaje(telefono, telefonoConductor, unidad, placa, color, nombre, minutos, foto, puertoPedido) {
  console.log(`Enviando mensaje con detalles del viaje a ${telefono} - Puerto recibido: "${puertoPedido}", Puerto sistema: "${port}"`);

  // Lógica de verificación según si el puerto está vacío o no
  if (!puertoPedido || puertoPedido.trim() === '') {
    console.log(`🔍 Puerto del pedido está vacío - verificando archivo de conversación`);
    // Puerto vacío: verificar archivo de conversación
    if (!verificarArchivoConversacion(telefono)) {
      console.log(`❌ No se puede enviar mensaje a ${telefono}: puerto vacío y archivo de conversación no existe`);
      return;
    }
    console.log(`✅ Puerto vacío pero archivo de conversación existe - enviando mensaje a ${telefono}`);
  } else {
    console.log(`🔍 Puerto del pedido no está vacío: "${puertoPedido}" - comparando con sistema: "${port}"`);
    // Puerto no vacío: comparar puerto del pedido vs puerto del sistema
    if (puertoPedido !== port.toString()) {
      console.log(`❌ Puerto no coincide. Pedido: "${puertoPedido}", Sistema: "${port}" - NO enviando mensaje a ${telefono}`);
      return;
    }
    console.log(`✅ Puerto coincide ("${puertoPedido}") - enviando mensaje a ${telefono}`);
  }

  const url = 'http://localhost:3005/app1/send/media-url';
  const params = new URLSearchParams();
  params.append('to', telefono);
  params.append('mediaUrl', foto);
  params.append('caption', `🚖 *Viaje Aceptado* 🚖\n⏳ *Tiempo De Llegada:* ${nombre} minutos\n\n👤 *Conductor:* ${minutos}\n📞 *Teléfono:* ${telefonoConductor} \n🚗 *Detalles del auto:*\n🚗 *Unidad:* ${unidad}\n📋 *Placa:* ${placa}\n🎨 *Color:* ${color}`);

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: params
    });

    if (response.ok) {
      const jsonResponse = await response.json();
      console.log(`Mensaje enviado con éxito a ${telefono}:`, jsonResponse);
    } else {
      console.error(`Error al enviar mensaje a ${telefono}:`, response.statusText);
    }
  } catch (error) {
    console.error(`Error al enviar mensaje a ${telefono}:`, error);
  }
}
// Función para enviar el mensaje de pedido finalizado
async function enviarMensajePedidoFinalizado(telefono, randon, unidad, nombre, color, placa, foto, telefonoConductor, puertoPedido) {
  console.log(`Enviando mensaje de pedido finalizado a ${telefono} - Puerto recibido: "${puertoPedido}", Puerto sistema: "${port}"`);

  // Lógica de verificación según si el puerto está vacío o no
  if (!puertoPedido || puertoPedido.trim() === '') {
    console.log(`🔍 Puerto del pedido está vacío - verificando archivo de conversación`);
    // Puerto vacío: verificar archivo de conversación
    if (!verificarArchivoConversacion(telefono)) {
      console.log(`❌ No se puede enviar mensaje a ${telefono}: puerto vacío y archivo de conversación no existe`);
      return;
    }
    console.log(`✅ Puerto vacío pero archivo de conversación existe - enviando mensaje a ${telefono}`);
  } else {
    console.log(`🔍 Puerto del pedido no está vacío: "${puertoPedido}" - comparando con sistema: "${port}"`);
    // Puerto no vacío: comparar puerto del pedido vs puerto del sistema
    if (puertoPedido !== port.toString()) {
      console.log(`❌ Puerto no coincide. Pedido: "${puertoPedido}", Sistema: "${port}" - NO enviando mensaje a ${telefono}`);
      return;
    }
    console.log(`✅ Puerto coincide ("${puertoPedido}") - enviando mensaje a ${telefono}`);
  }

  const url = 'http://localhost:3005/app1/send/message';
  const params = new URLSearchParams();
  params.append('to', telefono);

const mensajes = [
  `🎉 ¡Gracias por utilizar nuestros servicios! 🚖 Fue un placer atenderte. Califica ⭐ nuestro servicio aquí: https://turismoapp.xyz/califica.html?id=${randon}`,
  `🚖 Gracias por preferirnos. Esperamos verte pronto. Deja tu opinión ⭐ aquí: https://turismoapp.xyz/califica.html?id=${randon}`,
  `🌟 ¡Gracias por confiar en Taxi Turismo! 🚕 Tu opinión nos importa. Califica aquí: https://turismoapp.xyz/califica.html?id=${randon}`,
  `🙌 ¡Servicio completado! Gracias por elegirnos 🚖. Ayúdanos a mejorar con tu calificación ⭐: https://turismoapp.xyz/califica.html?id=${randon}`,
  `📣 Gracias por tu preferencia 🚕. Evalúa nuestro servicio ⭐ aquí: https://turismoapp.xyz/califica.html?id=${randon}`,
  `🎊 ¡Viaje finalizado! Gracias por confiar en nosotros 🚖. Califica tu experiencia ⭐: https://turismoapp.xyz/califica.html?id=${randon}`,
  `👍 ¡Listo! Tu viaje ha terminado. Gracias por preferirnos 🚕. Deja tu reseña ⭐: https://turismoapp.xyz/califica.html?id=${randon}`,
  `✨ Gracias por usar Taxi Turismo 🚖. Tu opinión cuenta. Califica aquí ⭐: https://turismoapp.xyz/califica.html?id=${randon}`,
  `📝 Tu viaje ha finalizado 🚕. Gracias por preferirnos. Por favor, califica ⭐ aquí: https://turismoapp.xyz/califica.html?id=${randon}`,
  `🎈 ¡Gracias por viajar con nosotros! 🚖 Ayúdanos a mejorar con tu calificación ⭐: https://turismoapp.xyz/califica.html?id=${randon}`,
  `📢 Servicio completado 🚕. Gracias por tu confianza. Deja tu calificación ⭐: https://turismoapp.xyz/califica.html?id=${randon}`,
  `💫 ¡Tu viaje ha llegado a su fin! 🚖 Gracias por elegirnos. Califica tu experiencia ⭐: https://turismoapp.xyz/califica.html?id=${randon}`,
  `📊 Gracias por preferir Taxi Turismo 🚕. Tu feedback es importante. Califica aquí ⭐: https://turismoapp.xyz/califica.html?id=${randon}`,
  `🎀 ¡Viaje finalizado! 🚖 Gracias por confiar en nosotros. Tu calificación ⭐ nos ayuda a mejorar: https://turismoapp.xyz/califica.html?id=${randon}`,
  `🚦 Gracias por viajar con Taxi Turismo 🚕. Evalúa nuestro servicio ⭐: https://turismoapp.xyz/califica.html?id=${randon}`,
  `🏁 ¡Llegaste a tu destino! 🚖 Gracias por elegirnos. Califica tu viaje ⭐: https://turismoapp.xyz/califica.html?id=${randon}`,
  `💌 ¡Gracias por preferirnos! 🚕 Ayúdanos a crecer con tu calificación ⭐ aquí: https://turismoapp.xyz/califica.html?id=${randon}`,
  `🌐 Gracias por usar nuestro servicio 🚖. Tu opinión es valiosa. Califica ⭐: https://turismoapp.xyz/califica.html?id=${randon}`,
  `📦 ¡Tu viaje ha terminado! 🚕 Gracias por tu confianza. Deja tu reseña ⭐: https://turismoapp.xyz/califica.html?id=${randon}`,
  `🔑 ¡Viaje completado! 🚖 Gracias por preferir Taxi Turismo. Califica tu experiencia ⭐: https://turismoapp.xyz/califica.html?id=${randon}`
];

// Seleccionar un mensaje al azar
const mensajeFinal = mensajes[Math.floor(Math.random() * mensajes.length)];

// Agregar el mensaje seleccionado a los parámetros
///params.append('message', mensajeFinal);


  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: params
    });

    if (response.ok) {
      const jsonResponse = await response.json();
      console.log(`Mensaje enviado con éxito a ${telefono}:`, jsonResponse);
    } else {
      console.error(`Error al enviar mensaje a ${telefono}:`, response.statusText);
    }
  } catch (error) {
    console.error(`Error al enviar mensaje a ${telefono}:`, error);
  }
}


// Función para enviar el mensaje de cambio de estado del pedido
async function enviarMensajeEstadoPedido(telefono, mensaje) {
  console.log(`Enviando mensaje de cambio de estado de pedido a ${telefono}`);

  // Esta función no recibe puerto, por lo que siempre debe verificar el archivo de conversación
  if (!verificarArchivoConversacion(telefono)) {
    console.log(`❌ No se puede enviar mensaje a ${telefono}: archivo de conversación no existe`);
    return;
  }

  const url = 'http://localhost:3005/app1/send/message';
  const params = new URLSearchParams();
  params.append('to', telefono);
  params.append('message', mensaje);

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: params
    });

    if (response.ok) {
      const jsonResponse = await response.json();
      console.log(`Mensaje enviado con éxito a ${telefono}:`, jsonResponse);
    } else {
      console.error(`Error al enviar mensaje a ${telefono}:`, response.statusText);
    }
  } catch (error) {
    console.error(`Error al enviar mensaje a ${telefono}:`, error);
  }
}
// Llama a la función para iniciar la sincronización
syncPedidoEnCursoToDetallesDeViajes();
syncPedidosDisponiblesListener();

class WhatsappWeb {
  constructor() {
    this.client = null;
    this.initClient();
    this.onQr();
    this.onReady();
    this.onDisconnect();
    this.onAuth();
    this.onAuthFailure();
    this.mediaPath = path.join(__dirname, '/media');
    this.sessionQR = null;
    
    // Sistema de control de velocidad para cumplir con WhatsApp Business
    this.messageQueue = [];
    this.isProcessingQueue = false;
    this.messagesPerMinute = 3; // Máximo recomendado
    this.messageInterval = 60000 / this.messagesPerMinute; // 20 segundos entre mensajes
    this.dailyMessageCount = 0;
    this.lastResetDate = new Date().toDateString();
    this.maxDailyMessages = 550; // Límite diario conservador
    
    // Sistema anti-spam: rastrear mensajes recientes
    this.recentMessages = new Map(); // número -> [mensajes recientes]
    this.maxRecentMessages = 5; // máximo de mensajes recientes a recordar
    
    // Validador de mensajes para cumplimiento
    this.messageValidator = new MessageValidator();
  }

  initClient() {
    try {
      const initConfig = {
        restartOnAuthFail: true,
        authStrategy: new LocalAuth(),
        puppeteer: {
          headless: true,
          args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-accelerated-2d-canvas',
            '--no-first-run',
            '--no-zygote',
            '--disable-gpu',
            '--disable-web-security',
            '--disable-features=VizDisplayCompositor'
          ],
          executablePath: undefined,
          timeout: 60000
        },
        // webVersion: '2.2412.54', // Removido según recomendaciones de Discord
        // webVersionCache: { // Removido - causa problemas según BenyFilho
        //   type: 'remote',
        //   remotePath: 'https://raw.githubusercontent.com/wppconnect-team/wa-version/main/html/2.2412.54.html'
        // }
      };

      if (isProduction) {
        initConfig.puppeteer = { 
          ...config.puppeteer,
          args: ['--no-sandbox', '--disable-setuid-sandbox'], // Aseg?rate de mantener estos argumentos en producci?n tambi?n
        };
      }

      this.client = new Client(initConfig);
      this.client.initialize();
    } catch (err) {
      console.error(err);
      process.exit(1);
    }
  }

  // Verificar si el mensaje es similar a mensajes recientes (anti-spam)
  isMessageSimilar(to, message) {
    const normalizedNumber = to.replace('@c.us', '').replace('@g.us', '');
    const recentMessages = this.recentMessages.get(normalizedNumber) || [];
    
    for (const recentMsg of recentMessages) {
      const similarity = stringSimilarity.compareTwoStrings(message.toLowerCase(), recentMsg.toLowerCase());
      if (similarity > 0.8) { // 80% de similitud
        console.log(`⚠️ Mensaje similar detectado para ${normalizedNumber} (similitud: ${(similarity * 100).toFixed(1)}%)`);
        return true;
      }
    }
    return false;
  }

  // Agregar mensaje al historial reciente
  addToRecentMessages(to, message) {
    const normalizedNumber = to.replace('@c.us', '').replace('@g.us', '');
    const recentMessages = this.recentMessages.get(normalizedNumber) || [];
    
    recentMessages.push(message);
    if (recentMessages.length > this.maxRecentMessages) {
      recentMessages.shift(); // Eliminar el más antiguo
    }
    
    this.recentMessages.set(normalizedNumber, recentMessages);
  }

  // Método para envío controlado de mensajes
  async sendMessageSafely(to, message, options = {}) {
    // Esta función es para mensajes internos del sistema, no requiere verificación de archivo de conversación
    
    // Simular escritura por 5 segundos
    try {
      const chat = await this.client.getChatById(to);
      await chat.sendStateTyping();        // Comenzar a escribir
      await new Promise(resolve => setTimeout(resolve, 5000));
      await chat.clearState();             // Detener escritura
    } catch (error) {
      console.log('Error al simular escritura:', error);
      // Continuar con el envío del mensaje aunque falle la simulación
    }
    
    // Agregar el nombre de la empresa al inicio del mensaje si no es una respuesta de estado
    if (!message.includes('*Seguimos buscando') && !message.includes('conductor')) {
      message = `*${empresa}*\n\n${message}`;
    }

    // Validar el mensaje antes de enviarlo
    const validation = this.messageValidator.validateMessage(message, to);
    
    if (!validation.isValid) {
      console.log(`🚫 Mensaje bloqueado por validación: ${to}`);
      validation.errors.forEach(error => console.log(`❌ Error: ${error}`));
      return Promise.reject(new Error('Mensaje no válido: ' + validation.errors.join(', ')));
    }

    // Mostrar advertencias si las hay
    if (validation.warnings.length > 0) {
      console.log(`⚠️ Advertencias para mensaje a ${to}:`);
      validation.warnings.forEach(warning => console.log(`⚠️ ${warning}`));
    }

    // Verificar horario apropiado
    const scheduleCheck = this.messageValidator.checkSchedule();
    if (!scheduleCheck.isAllowedTime) {
      console.log(`⏰ Mensaje programado para horario permitido: ${to}`);
      // En producción, podrías agregar a una cola diferida
    }

    // Verificar si el mensaje es demasiado similar a mensajes recientes
    if (this.isMessageSimilar(to, message)) {
      console.log(`🚫 Mensaje bloqueado por similitud para evitar spam: ${to}`);
      return Promise.resolve(); // Resolver sin enviar
    }

    return new Promise((resolve, reject) => {
      this.messageQueue.push({
        to,
        message,
        options,
        resolve,
        reject,
        timestamp: Date.now(),
        validation: validation
      });
      
      this.processMessageQueue();
    });
  }

  async processMessageQueue() {
    if (this.isProcessingQueue || this.messageQueue.length === 0) {
      return;
    }

    this.isProcessingQueue = true;

    try {
      // Resetear contador diario si es un nuevo día
      const currentDate = new Date().toDateString();
      if (currentDate !== this.lastResetDate) {
        this.dailyMessageCount = 0;
        this.lastResetDate = currentDate;
        console.log('🔄 Contador diario de mensajes reiniciado');
      }

      while (this.messageQueue.length > 0) {
        // Verificar límite diario
        if (this.dailyMessageCount >= this.maxDailyMessages) {
          console.log('⚠️ Límite diario de mensajes alcanzado. Pausando hasta mañana.');
          break;
        }

        const messageData = this.messageQueue.shift();
        
        try {
          await this.client.sendMessage(messageData.to, messageData.message, messageData.options);
          this.dailyMessageCount++;
          this.addToRecentMessages(messageData.to, messageData.message); // Agregar al historial
          console.log(`✅ Mensaje enviado de forma segura a ${messageData.to} (${this.dailyMessageCount}/${this.maxDailyMessages})`);
          messageData.resolve();
        } catch (error) {
          console.error(`❌ Error enviando mensaje a ${messageData.to}:`, error);
          messageData.reject(error);
        }

        // Pausa obligatoria entre mensajes (cumplimiento WhatsApp Business)
        if (this.messageQueue.length > 0) {
          // Pausa más larga después de cada 10 mensajes
          const pauseTime = this.dailyMessageCount % 10 === 0 ? this.messageInterval * 3 : this.messageInterval;
          console.log(`⏱️ Esperando ${pauseTime/1000} segundos antes del siguiente mensaje...`);
          await new Promise(resolve => setTimeout(resolve, pauseTime));
        }
      }
    } finally {
      this.isProcessingQueue = false;
    }
  }

  onQr() {
    this.client.on('qr', async qr => {
      try {
        // Generar QR como imagen base64
        const qrImage = await QRCode.toDataURL(qr, {
          errorCorrectionLevel: 'M',
          type: 'image/png',
          quality: 0.92,
          margin: 1,
          color: {
            dark: '#000000',
            light: '#FFFFFF'
          },
          width: 256
        });
        
        this.sessionQR = qrImage;
        console.log('📱 Nuevo código QR generado para WhatsApp Web');
        
        // También mostrar en terminal para debug
        qrcode.generate(qr, { small: true });
      } catch (error) {
        console.error('Error generando QR:', error);
        this.sessionQR = qr; // Fallback al texto original
      }
    });
  }

  onReady() {
    this.client.on('ready', () => {
      console.log('🟢 Cliente WhatsApp listo y conectado!');
      console.log(`📱 Información del cliente:`, this.client.info);
      // Limpiar QR cuando el cliente se conecte
      this.sessionQR = null;
    
      this.onMessage();
    });
  }

  onDisconnect() {
    this.client.on('disconnected', (reason) => {
      console.log('🔴 Cliente desconectado:', reason);
      this.sessionQR = null;
      setTimeout(() => {
        console.log('🔄 Reinicializando cliente...');
        if (this.client) {
          this.client.destroy();
        }
        this.initClient();
      }, 5000);
    });
  }

  onMessage() {
    this.client.on('message', async (msg) => {
      try {
        // Consultar en la base de datos si el estado es 'true'
        const estadoRef = admin.firestore().collection('configuracion').doc('status');
        const estadoDoc = await estadoRef.get();

        if (!estadoDoc.exists) {
            console.log("No se encontró el estado de configuración en la base de datos.");
            return;
        }

        const estado = estadoDoc.data().estado;
        console.log(`📨 Mensaje recibido de: ${msg.from} | Tipo: ${msg.type} | Contenido: ${msg.body?.substring(0, 50) || 'N/A'}`);
        console.log(`🔧 Estado del sistema: ${estado}`);

        if (estado !== true) {
            return;
        }
      
   

        if (msg.from.endsWith('@g.us') || msg.from.endsWith('status@broadcast')) {
            console.log(`Mensaje de grupo o broadcast ignorado. ${msg.from}`);
            return;
        }

        if (msg.type === 'image' || msg.type === 'status@broadcast' || msg.type === 'status') {
            console.log("Mensaje de imagen o broadcast ignorado.");
            return;
        }

      // Extraer número de teléfono del mensaje
      const telefono = msg.from.replace('@c.us', '');
      
      // Crear archivo de conversación cuando el cliente escriba, envíe ubicación o audio
      if (msg.type === 'chat' || msg.type === 'location' || (msg.type === 'ptt' && msg.hasMedia)) {
        crearArchivoConversacion(telefono);
      }

      if (msg.type === 'ptt' && msg.hasMedia) {
            console.log("Mensaje de audio ignorado.");
            return;

      }
      
      const saludos = [
        'hola', 'buenos dias', 'buenas noches', 'saludos', 'Movil', 'hola, ¿podría pedir un taxi?',
        'buenos días, necesito un taxi por favor', 'un movil, un taxi', 'un móvil', 'me envía un móvil por favor',
        'un móvil por favor', 'buen día un taxi', 'buenos días', 'me puede mandar un móvil por favor',
        'me podría enviar un móvil', 'me podría mandar un móvil', 'buenos días un móvil por favor',
        'buen día por favor un móvil', 'móvil por favor', 'un taxi por favor', 'buenas tardes envíeme un móvil por favor',
        'buenas tardes disculpe un móvil por favor', 'tienes móviles disponibles', 'buenas tardes tiene servicio',
        'tiene móvil disponible', 'servicio de radio móvil', 'hola, ¿podría enviarme un taxi?',
        'buenas noches, necesito un TAXI para ir a...', 'hola, necesito un taxi para el aeropuerto',
        'buenos días, ¿podría llamarme un taxi?', 'buenas tardes envíeme un móvil por favor', 'hola, necesito un taxi urgente',
        'buenos días, necesito un móvil por favor', 'buenas tardes, ¿podría solicitar un taxi?', 'hola, ¿podría enviarme un taxi?',
        'buenas noches, necesito un movil para ir a...', 'hola, necesito un taxi para el aeropuerto',
        'buenos días, ¿podría llamarme un taxi?', '¿podría enviarme un taxi a mi ubicación?', 'hola, necesito un taxi urgente',
        'buenos días, necesito un móvil por favor', 'un móvil, un móvil', 'buenas tardes, ¿podría solicitar un móvil?',
        'hola, ¿podría enviarme un móvil?', 'buenas noches, necesito un móvil para ir a...', 'hola, necesito un móvil para el aeropuerto',
        'buenos días, ¿podría llamarme un móvil?', '¿podría enviarme un móvil a mi ubicación?', 'hola, necesito un móvil urgente',
        'buenas noches, ¿podría pedir un móvil con asiento de bebé?', 'hola, ¿podría enviarme un móvil para 4 personas?',
        'buenos días, ¿podría reservar un móvil para dentro de una hora?', 'buenas tardes, necesito un móvil para ir al centro',
        'hola, necesito un móvil para ir al hospital', 'buenas noches móvil para mañana temprano?', 'hola, ¿podría enviar un móvil con maletero grande?',
        'buenos días, necesito un TAXI para ir al aeropuerto', 'buenas tardes, ¿podría solicitar un móvil para', 'buenas noches, ¿podría enviarme un taxi para'
    ];


        let similarity = stringSimilarity.findBestMatch(msg.body.toLowerCase(), saludos);
    
     
                    if (similarity.bestMatch.rating > 0.6) {
  console.log(`Saludo reconocido: ${similarity.bestMatch.target}, similitud ${similarity.bestMatch.rating}`);

  // Para saludos, solo usar el nombre de WhatsApp (sin consultar BD)
  const nombreWhatsApp = msg._data.notifyName || 'Cliente';

  const mensajes = [
    `${nombreWhatsApp}, 🚖 Para solicitar un taxi, mándame tu ubicación actual, por favor.`,
    `${nombreWhatsApp}, 🤖 Si quieres un taxi, comparte tu ubicación con un mensaje.`,
    `${nombreWhatsApp}, 👋 Envíame tu ubicación para gestionar tu taxi.`,

    `${nombreWhatsApp}, 📍 Indícame dónde estás para enviarte un taxi.`,

    `${nombreWhatsApp}, 🚕 Mándame tu localización y en seguida te busco un taxi.`,

    `${nombreWhatsApp}, 😊 Por favor comparte tu ubicación para solicitar tu taxi.`,

    `${nombreWhatsApp}, 📲 Facilítame tu localización actual y te asigno un taxi.`,

    `${nombreWhatsApp}, 🙌 Dime dónde te encuentras enviando tu ubicación.`,

    `${nombreWhatsApp}, 🗺️ Comparte tu ubicación y en breve tendrás un taxi.`,

    `${nombreWhatsApp}, ✨ Para un taxi, envía tu ubicación ahora mismo.`,

    `${nombreWhatsApp}, ⭐ Envíame tu ubicación actual para pedir tu taxi.`,

    `${nombreWhatsApp}, 🎯 Comparte tu localización y te conecto con un conductor.`,

    `${nombreWhatsApp}, 💬 ¿Dónde estás? Mándame tu localización.`,

    `${nombreWhatsApp}, 🤝 Comparte tu ubicación y listo, ¡tu taxi viene en camino!`,

    `${nombreWhatsApp}, 🎉 Mándame tu ubicación y comienzo a buscar tu taxi.`,

    `${nombreWhatsApp}, 🕒 Por favor envía tu localización para tramitar tu taxi.`,

    `${nombreWhatsApp}, 💫 Para un taxi rápido, compárteme tu ubicación.`,

    `${nombreWhatsApp}, 🚦 Facilítame tu ubicación y te asigno un conductor.`,

    `${nombreWhatsApp}, 🌟 Necesito tu localización para gestionar tu taxi.`,

    `${nombreWhatsApp}, 📢 Envía tu localización actual y te consigo un taxi.`,

    `${nombreWhatsApp}, 🛣️ Comparte tu ubicación para iniciar tu viaje.`,

    `${nombreWhatsApp}, 🔔 Dime tu ubicación y busco un taxi para ti.`,

    `${nombreWhatsApp}, 💡 Para un taxi, mándame tu localización.`,

    `${nombreWhatsApp}, 🎈 Comparte tu localización y te ayudo al instante.`,

    `${nombreWhatsApp}, 📦 Necesito tu ubicación para asignarte un taxi.`,

    `${nombreWhatsApp}, ⚡ Envía tu ubicación y en segundos tendrás un taxi.`,

    `${nombreWhatsApp}, 📆 Comparte tu ubicación y gestiono tu taxi.`,

    `${nombreWhatsApp}, ✋ Por favor comparte tu localización para pedir taxi.`,

    `${nombreWhatsApp}, 🌈 Mándame tu ubicación actual y te asigno un conductor.`,

    `${nombreWhatsApp}, 🔍 Para buscar un taxi, envía tu ubicación.`,

    `${nombreWhatsApp}, 🎵 Comparte tu ubicación y tu taxi estará en camino.`,

    `${nombreWhatsApp}, 📖 Facilítame tu ubicación y gestiono el servicio.`,

    `${nombreWhatsApp}, 🌞 Envíame tu ubicación para solicitar tu taxi.`,

    `${nombreWhatsApp}, 🌙 Comparte tu  ubicación te ayudo a pedir un taxi.`,

    `${nombreWhatsApp}, 📌 Para un taxi rápido, envía tu ubicación.`,

    `${nombreWhatsApp}, 💼 Mándame tu ubicación actual y te conecto con un taxi.`,

    `${nombreWhatsApp}, 🎨 Comparte tu localización y preparo tu viaje.`,

    `${nombreWhatsApp}, 🚀 Envíame tu ubicación y agilizo tu solicitud de taxi.`,

    `${nombreWhatsApp}, 🖐️ Facilítame tu ubicación para gestionar tu taxi.`,

    `${nombreWhatsApp}, 📼 Comparte tu ubicación y en breve tendrás un conductor.`,

    `${nombreWhatsApp}, 🏁 Para tu taxi, envía tu ubicación actual.`,

    `${nombreWhatsApp}, 📰 Comparte tu ubicación y te asigno un taxi al instante.`,
  ];

  const responseMsg = mensajes[Math.floor(Math.random() * mensajes.length)];
  this.sendMessageSafely(msg.from, responseMsg);
}

    } catch (error) {
      console.error('Error en el procesamiento del mensaje:', error);
    }

    // Procesar mensajes de ubicación
    if (msg.type === 'location') {
      try {
        // Extraer número del remitente
        const senderNumber = msg.from.split('@')[0];
        const normalizedNumber = senderNumber.includes('@c.us')
          ? senderNumber.split('@')[0]
          : senderNumber;

        // Obtener nombre de contacto de WhatsApp
        const contact = await this.client.getContactById(msg.from);
        const nombreWhatsApp = contact.pushname || msg._data.notifyName || 'Cliente';
        
        // Obtener nombre del cliente desde la base de datos
        const nombreBD = await obtenerNombreClienteDesdeBD(normalizedNumber);
        
        // Concatenar nombres: nombre de BD entre paréntesis + nombre de WhatsApp
        const nombre = nombreBD ? `${nombreBD} (${nombreWhatsApp})` : nombreWhatsApp;

        // Consultar pedido existente
        const pedidosRef = admin.firestore().collection('pedidosDisponibles1');
        const pedidoSnapshot = await pedidosRef.where('telefono', '==', normalizedNumber).get();

        // Determinar rango de inserción según número de pedidos
        const pedidosCount = (await pedidosRef.get()).size;
        const rangoInsercion = pedidosCount > 3 ? '5' : '1';

        if (pedidoSnapshot.empty) {
          // No hay pedido en curso: procesar nueva solicitud
          const latitude = msg.location.latitude.toString();
          const longitude = msg.location.longitude.toString();

          // Obtener detalles de la dirección
          const addressDetails = await getAddressDetailsFromCoordinates(latitude, longitude);
          const formattedAddress = addressDetails?.street
            ? `${addressDetails.street}, ${addressDetails.intersection || ''}`
            : 'Dirección no disponible';
          const sector = addressDetails?.sector || 'Sector Salgolqui';
          const intersection = addressDetails?.intersection || 'Intersección no disponible';

          // Generar códigos aleatorios
          function generarRandomCD() {
            const numero = Math.floor(Math.random() * 100) + 1;
            return `T-${numero.toString().padStart(2, '0')}`;
          }
          function generarRandon() {
            const letras = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
            const numeros = '0123456789';
            let resultado = '';
            let esLetra = Math.random() < 0.5;
            for (let i = 0; i < 6; i++) {
              resultado += esLetra
                ? letras.charAt(Math.floor(Math.random() * letras.length))
                : numeros.charAt(Math.floor(Math.random() * numeros.length));
              esLetra = !esLetra;
            }
            return resultado;
          }
          const codigo  = generarRandomCD();
          const randon  = generarRandon();

          // Mensajes de confirmación (elige 10 variantes)
         
const mensajes = [
  "🚖 ¡Genial! Gracias por compartir tu ubicación. Estamos procesando tu solicitud…",
  "📍 Ubicación recibida. En breve te asigno un conductor.",
  "🚕 Recibimos tu ubicación. Gestionando tu taxi ahora.",
  "🤖 Ubicación captada. Tramitando tu pedido de taxi.",
  "✨ Gracias por la ubicación. Buscando conductor disponible…",
  "🙌 Tu ubicación está en nuestros sistemas. Solicitando servicio.",
  "🔔 Ubicación confirmada. Preparando tu viaje.",
  "📲 Gracias por compartir tu localización. Tu taxi viene en camino.",
  "⚡ Ubicación obtenida. Procesando tu solicitud rápidamente.",
  "🌟 ¡Listo! Estamos gestionando tu taxi a tu ubicación.",
  "✅ Recibimos tu ubicación. En breve confirmo tu viaje.",
  "🕐 Tu ubicación ya está registrada. Buscando conductor.",
  "📡 Ubicación detectada. Un momento por favor.",
  "🔍 Ubicación capturada. Asignando vehículo.",
  "🎉 ¡Todo listo! Gestionando tu taxi.",
  "🚀 Tu taxi está en camino, un momento…",
  "📌 Ubicación confirmada. En camino…",
  "📈 Analizando tu ubicación para asignar el mejor conductor.",
  "💬 Ubicación recibida. Te aviso en un instante.",
  "🛣️ Ubicación registrada. Preparando tu viaje."
];




      const selectedMsg = mensajes[Math.floor(Math.random() * mensajes.length)];

      // Enviar mensaje de confirmación
      await this.sendMessageSafely(msg.from, selectedMsg);

      // Preparar datos del nuevo pedido
      const newPedidoData = {
        clave:             codigo,
        codigo:            nombre,
        coorporativo:      false,
        destino:           sector,
        direccion:         formattedAddress,
        estado:            "Disponible",
        fecha:             new Date().toLocaleString('es-EC', { timeZone: 'America/Guayaquil' }),
        foto:              "0",
        idConductor:       "Sin asignar",
        latitud:           latitude,
        latitudConductor:  "",
        llegue:            false,
        longitud:          longitude,
        longitudConductor: "",
        nombreCliente:     nombre,
        pedido:            "Disponible",
        randon:            randon,
        rango:             rangoInsercion,
        sector:            intersection,
        telefono:          normalizedNumber,
        valor:             codigo,
          puerto:            "3005",
        viajes:            codigo
      };

      // Crear pedido en Firestore
      const docRef = pedidosRef.doc();
      newPedidoData.id = docRef.id;
      await docRef.set(newPedidoData);
      console.log(`Nuevo pedido creado con ID: ${docRef.id}`);

      // Iniciar verificación periódica del estado
      revisarEstadoPedido(msg, docRef.id, this);
    } else {
      // Ya existe un pedido en curso
      await this.sendMessageSafely(
        msg.from,
        "🚫 Ya tienes un pedido en curso. Por favor espera a que termine o cancélalo antes de solicitar uno nuevo."
      );
    }
  } catch (error) {
    console.error('Error procesando el mensaje de ubicación:', error);
    this.sendMessageSafely(
      msg.from,
      '❌ Hubo un error al procesar tu ubicación. Por favor intenta nuevamente más tarde.'
    );
  }
}







      async function getAddressDetailsFromCoordinates(latitude, longitude) {
        const apiKey = "AIzaSyC9PomQk6iYVbAd4eHGoxIZgynj7sVNn5g"; // Usa tu clave real de Google Maps API
        const url = `https://maps.googleapis.com/maps/api/geocode/json?latlng=${latitude},${longitude}&key=${apiKey}`;
    
        try {
            // Primero busca si la ubicación está dentro de algún polígono almacenado en la base de datos
            let sectorFromDB = await getSectorFromDatabase(latitude, longitude);
    
            // Consultar la API de Google Maps
            const response = await axios.get(url);
            if (response.data.results.length > 0) {
                const results = response.data.results; // Trabaja con los resultados obtenidos
                const firstResult = results[0]; // El primer resultado generalmente tiene la información más relevante
                const addressComponents = firstResult.address_components;
    
                // Extraer la dirección formateada
                const formattedAddress = firstResult.formatted_address;
    
                // Extraer componentes específicos
                const street = addressComponents.find(ac => ac.types.includes('route'))?.long_name || formattedAddress;
    
                // Si no se encuentra un sector en la base de datos, utiliza el de Google Maps
                const sector = sectorFromDB || addressComponents.find(ac => ac.types.includes('sublocality_level_1'))?.long_name || 'Sector desconocido';
    
                // Intentar encontrar una intersección cercana usando una búsqueda en los resultados adicionales
                let intersection = 'Intersección desconocida';
                for (let result of results) {
                    const potentialStreet = result.address_components.find(ac => ac.types.includes('route'))?.long_name;
                    if (potentialStreet && potentialStreet !== street) {
                        intersection = potentialStreet;
                        break;
                    }
                }
    
                // Si después de la búsqueda sigue siendo 'Intersección desconocida', asignar el formattedAddress
                if (intersection === 'Intersección desconocida') {
                    intersection = formattedAddress;
                }
    
                console.log(`Calle: ${street}`);
                console.log(`Intersección: ${intersection}`);
                console.log(`Sector: ${sector}`);
                console.log(`Dirección Formateada: ${formattedAddress}`);
    
                return { street, intersection, sector, formattedAddress };
            } else {
                throw new Error('No se encontraron resultados para las coordenadas dadas.');
            }
        } catch (error) {
            console.error('Error al obtener detalles de la dirección desde Google Maps:', error);
            throw error;
        }
    }
    
    // Función para verificar si las coordenadas están dentro de algún polígono almacenado en la base de datos
    async function getSectorFromDatabase(latitude, longitude) {
        try {
            const poligonosSnapshot = await db.collection('poligonos').get();
    
            for (const doc of poligonosSnapshot.docs) {
                const poligonoData = doc.data();
                const coordenadas = poligonoData.coordenadas;
    
                if (isPointInPolygon(latitude, longitude, coordenadas)) {
                    console.log(`Coordenadas dentro del polígono: ${poligonoData.nombre_sector}`);
                    return poligonoData.nombre_sector;
                }
            }
    
            console.log('Coordenadas no encontradas en ningún polígono.');
            return null;
        } catch (error) {
            console.error('Error al consultar la base de datos:', error);
            throw error;
        }
    }
    
    // Función para verificar si un punto está dentro de un polígono
    function isPointInPolygon(lat, lng, polygonCoords) {
        let inside = false;
        const x = lng, y = lat;
    
        for (let i = 0, j = polygonCoords.length - 1; i < polygonCoords.length; j = i++) {
            const xi = polygonCoords[i].lng, yi = polygonCoords[i].lat;
            const xj = polygonCoords[j].lng, yj = polygonCoords[j].lat;
    
            const intersect = ((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
            if (intersect) inside = !inside;
        }
    
        return inside;
    }


      async function revisarEstadoPedido(msg, pedidoId, whatsappInstance) {
        const pedidosRef = admin.firestore().collection('pedidosDisponibles1');
        const canceladosRef = admin.firestore().collection('PedidosCancelados');
        let startTime = Date.now();
        let mensajesEnviados = 0;
      
        let intervalo = setInterval(async () => {
          try {
            const docRef = pedidosRef.doc(pedidoId);
            const doc = await docRef.get();
            if (!doc.exists) {
              console.log('No se encontró el pedido');
              clearInterval(intervalo);
              return;
            }
      
            const pedidoData = doc.data();
            const { clave, direccion, destino, estado, rango } = pedidoData;
            let elapsedTime = Date.now() - startTime;
      
            if (estado === "Disponible") {
              // Actualizar el rango a 5 si es 1
              if (parseInt(rango) === 1) {
                await pedidosRef.doc(pedidoId).update({ rango: '10' });
              }
      
              // Enviar el primer mensaje a los 5 minutos
              if (elapsedTime > 300000 && mensajesEnviados === 0) { // 5 minutos
                mensajesEnviados++;
          //      await whatsappInstance.sendMessageSafely(msg.from, '*Seguimos buscando un conductor para ti....* ¡Valoramos mucho tu tiempo!');
                const number1 = '593994633688-1548213413@g.us';
                const message = `*SOLICITUD PENDIENTE EN APP* #⃣  ${clave} 
      
      Calle: ${direccion}📍
      ${destino}`;
                whatsappInstance.client.sendMessage(number1, message);
              }
      
              // Enviar un segundo mensaje a los 10 minutos
              if (elapsedTime > 600000 && mensajesEnviados === 1) { // 10 minutos
                mensajesEnviados++;
               // const mensaje = '*Seguimos trabajando para encontrar un conductor para ti.*';
                await whatsappInstance.sendMessageSafely(msg.from, mensaje);
              }
      
              // Cancelar el pedido después de 15 minutos
              if (elapsedTime > 900000) { // 15 minutos
                console.log('El pedido sigue disponible después de 15 minutos.');
                await canceladosRef.doc(pedidoId).set(pedidoData);
                await pedidosRef.doc(pedidoId).delete();
                clearInterval(intervalo);
      
                await whatsappInstance.sendMessageSafely(msg.from, '🚫 *Lo sentimos, no hemos podido conseguir una unidad.* Por favor, inténtelo nuevamente enviándonos *su ubicación actual.*');
              }
            } else {
              console.log('El pedido ya no está disponible.');
              clearInterval(intervalo);
            }
          } catch (error) {
            if (error.code !== 'ENOENT') {
              console.error('Error al verificar el estado del pedido:', error);
            }
          }
        }, 30000); // Revisa el estado cada 30 segundos
      } 
      


// Función para verificar si la ubicación está dentro de algún polígono en Firestore
async function isLocationInPolygons(latitude, longitude) {
  try {
      const poligonosRef = admin.firestore().collection('poligonoscirque');
      const snapshot = await poligonosRef.get();

      for (const doc of snapshot.docs) {
          const polygonData = doc.data();
          const polygonCoords = polygonData.coordenadas;

          if (isPointInPolygon1(latitude, longitude, polygonCoords)) {
              console.log(`La ubicación está dentro del polígono: ${polygonData.nombre_sector}`);
              return true; // Está dentro del polígono
          }
      }

      console.log('La ubicación no está dentro de ningún polígono.');
      return false; // No está dentro de ningún polígono
  } catch (error) {
      console.error('Error consultando Firestore:', error);
      throw error;
  }
}

// Verificar si un punto está dentro de un polígono
function isPointInPolygon1(lat, lng, polygonCoords) {
  let inside = false;
  const x = lng, y = lat;

  for (let i = 0, j = polygonCoords.length - 1; i < polygonCoords.length; j = i++) {
      const xi = polygonCoords[i].lng, yi = polygonCoords[i].lat;
      const xj = polygonCoords[j].lng, yj = polygonCoords[j].lat;

      const intersect = ((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
      if (intersect) inside = !inside;
  }

  return inside;
}



    
    function obtenerMensaje(mensajesEnviados) {
        const mensajes = [

          
           // '*Seguimos buscando un taxi....*\n\nGracias por tu paciencia\n\n*¡Valoramos tu tiempo!*',
            'La búsqueda de una unidad continúa gracias por tu paciencia. \n\nSi deseas *cancelar* la busqueda, simplemente responde con la palabra "cancelar".',
        ];
    
        return mensajes[(mensajesEnviados - 1) % mensajes.length];
    }
    



        if (/cancelar|anular|ya no quiero el taxi|cancele/i.test(msg.body)) {
            const telefono = msg.from.split('@')[0];
            try {
                const cancelMessage = await cancelarPedido(telefono, msg.from, this);
                if (cancelMessage && verificarArchivoConversacion(telefono)) {
                    this.client.sendMessage(msg.from, cancelMessage);
                }
            } catch (error) {
                console.error('Error al cancelar el pedido:', error);
                if (verificarArchivoConversacion(telefono)) {
                    this.client.sendMessage(msg.from, 'Hubo un error al procesar su solicitud de cancelación.');
                }
            }
            return;
        }


        async function cancelarPedido(phone, from, whatsappInstance) {
          try {
            const normalizedPhone = phone.includes('@c.us') ? phone.split('@')[0] : phone; // Normaliza el número si es necesario
            const pedidosRef = admin.firestore().collection('pedidosDisponibles1');
            
            // Busca un pedido con estado "Disponible"
            let querySnapshot = await pedidosRef.where('telefono', '==', normalizedPhone).where('estado', '==', 'Disponible').get();
        
            if (querySnapshot.empty) {
              // Si no se encuentra en 'pedidosDisponibles', busca en 'PedidosEnCurso'
              const pedidosEnCursoRef = admin.firestore().collection('pedidoEnCurso');
              querySnapshot = await pedidosEnCursoRef.where('telefono', '==', normalizedPhone).where('estado', '==', 'Aceptado').get();
              
              if (querySnapshot.empty) {
                console.log('No se encontró un pedido disponible para cancelar en ninguna colección.');
                return 'No se encontró tu pedido o ya no está en estado disponible para ser cancelado.';
              } else {
                // Si se encuentra un pedido en estado "Aceptado"
                const pedidoDoc = querySnapshot.docs[0];
                const docData = pedidoDoc.data();
        
                // Enviar mensaje al conductor si el pedido está siendo cancelado y está en estado "Aceptado"
                if (docData.estado === 'Aceptado' && docData.telefonoConductor) {
                  const numeroLocal = docData.telefonoConductor;
                  const numerounidad = docData.unidad;
                  const numerocliente = docData.telefono;
                  const numeroSinPrimerCaracter = numeroLocal.slice(1);
                  const numeroInternacional = "593" + numeroSinPrimerCaracter;
        
                  await whatsappInstance.client.sendMessage(numeroInternacional + "@c.us", '🚫 Su Viaje ha sido *Cancelado por el cliente.* Esperamos poder asignarte nuevos viajes. 🚐');
                  await whatsappInstance.client.sendMessage(grupounidades, `🚫  El pedido ha sido cancelado *POR EL CLIENTE +${numerocliente}  Y  ACEPTADO POR LA UNIDAD* - ${numerounidad}`);
           
           



                }
        
                // Usar transacción para actualizar y mover el pedido a la colección 'PedidosCancelados'
                await admin.firestore().runTransaction(async (transaction) => {
                  // Actualizar el estado del pedido a "Cancelado"
                  transaction.update(pedidoDoc.ref, { estado: 'Cancelado' });
                  console.log(`Pedido cancelado exitosamente: ${pedidoDoc.id}`);
        
                  // Mover el pedido a la colección 'PedidosCancelados'
                  const pedidosCanceladosRef = admin.firestore().collection('PedidosCancelados');
                  transaction.set(pedidosCanceladosRef.doc(pedidoDoc.id), docData);
        
                  // Eliminar el documento original después de moverlo
                  transaction.delete(pedidoDoc.ref);
                });
        
                console.log(`Pedido movido a 'PedidosCancelados' y eliminado de la colección original.`);
                
                            // Enviar mensaje al cliente
            await whatsappInstance.sendMessageSafely(from, '🚫 Su pedido ha sido *cancelado.* Esperamos poder servirle en su próximo viaje. 🚐');
                return;
              }
            }
        
            // Suponemos que solo hay un pedido activo por número de teléfono en cualquier momento
            const pedidoDoc = querySnapshot.docs[0];
            const pedidoData = pedidoDoc.data();
        
            // Verificar si el campo 'pedido' es 'Iniciado'
            if (pedidoData.pedido === 'Iniciado') {
              console.log('El pedido ya ha sido aceptado. La función se detiene.');
                                await whatsappInstance.sendMessageSafely(from, '🚫 ✋ Su pedido ha sido *Iniciado el Taxímetro.* no puede ser Cancelado. 🚐');
              return;
            }
        
            // Usar transacción para actualizar y mover el pedido a la colección 'PedidosCancelados'
            await admin.firestore().runTransaction(async (transaction) => {
              // Actualizar el estado del pedido a "Cancelado"
              transaction.update(pedidoDoc.ref, { estado: 'Cancelado' });
              console.log(`Pedido cancelado exitosamente: ${pedidoDoc.id}`);
        
              // Mover el pedido a la colección 'PedidosCancelados'
              const pedidosCanceladosRef = admin.firestore().collection('PedidosCancelados');
              transaction.set(pedidosCanceladosRef.doc(pedidoDoc.id), pedidoData);
        
              // Eliminar el documento original después de moverlo
              transaction.delete(pedidoDoc.ref);
            });
        
            console.log(`Pedido movido a 'PedidosCancelados' y eliminado de la colección original.`);
            
            // Enviar mensaje al cliente
            await whatsappInstance.sendMessageSafely(from, '🚫 Su pedido ha sido *cancelado.* Esperamos poder servirle en su próximo viaje. 🚐');
        
        
        
        
        
        
        
            return;
        
          } catch (error) {
            console.error('Error al cancelar el pedido:', error);
            return 'Hubo un error al procesar tu solicitud de cancelación. Por favor, intenta nuevamente.';
          }
        }
        

     



    });






}




  async createPedidoDisponible(pedido) {
    try {
      await admin.firestore().collection('pedidosDisponibles').doc(pedido.id).set(pedido);
      console.log(`Documento con ID ${pedido.id} creado en pedidosDisponibles`);
    } catch (error) {
      console.error('Error al crear el documento en pedidosDisponibles:', error);
    }
  }

  async updatePedidoDisponible(docId, docData) {
    try {
      await admin.firestore().collection('pedidosDisponibles1').doc(docId).update(docData);
      console.log(`Documento con ID ${docId} actualizado en pedidosDisponibles1`);
    } catch (error) {
      console.error('Error al actualizar el documento en pedidosDisponibles:', error);
    }
  }

  async deletePedidoDisponible(docId) {
    try {
      await admin.firestore().collection('pedidosDisponibles1').doc(docId).delete();
      console.log(`Documento con ID ${docId} eliminado de pedidosDisponibles`);
    } catch (error) {
      console.error('Error al eliminar el documento de pedidosDisponibles:', error);
    }
  }


  async createPedidoDisponible(pedido) {
    try {
      await admin.firestore().collection('pedidosDisponibles1').doc(pedido.id).set(pedido);
      console.log(`Documento con ID ${pedido.id} creado en pedidosDisponibles`);
    } catch (error) {
      console.error('Error al crear el documento en pedidosDisponibles:', error);
    }
  }

  async updatePedidoDisponible(docId, docData) {
    try {
      await admin.firestore().collection('pedidosDisponibles1').doc(docId).update(docData);
      console.log(`Documento con ID ${docId} actualizado en pedidosDisponibles`);
    } catch (error) {
      console.error('Error al actualizar el documento en pedidosDisponibles:', error);
    }
  }

  async deletePedidoDisponible(docId) {
    try {
      await admin.firestore().collection('pedidosDisponibles1').doc(docId).delete();
      console.log(`Documento con ID ${docId} eliminado de pedidosDisponibles`);
    } catch (error) {
      console.error('Error al eliminar el documento de pedidosDisponibles:', error);
    }
  }


  
  sendMessage(to, msg, isGroup, caption = '') {
    const append = !isGroup ? '@c.us' : '@g.us';
    let chatId = !to.includes(append) ? `${to}${append}` : to;
    if (chatId[0] === '+') { chatId = chatId.slice(1); }
    
    return new Promise((resolve, reject) => {
      this.client.sendMessage(chatId, msg, { caption })
        .then(resolve)
        .catch(reject);
    });
  }

  async sendMedia(to, file, isGroup, caption) {
    const append = !isGroup ? '@c.us' : '@g.us';
    let chatId = !to.includes(append) ? `${to}${append}` : to;
    if (chatId[0] === '+') { chatId = chatId.slice(1); }

    try {
      let media;

      if (file.startsWith('http')) {
        const response = await axios.get(file, { responseType: 'arraybuffer' });
        const mediaType = response.headers['content-type'];
        const mediaData = Buffer.from(response.data, 'binary').toString('base64');
        media = new MessageMedia(mediaType, mediaData, path.basename(file));
      } else {
        media = MessageMedia.fromFilePath(path.join(this.mediaPath, file));
      }

      return this.client.sendMessage(chatId, media, { caption });
    } catch (error) {
      console.error('Error al enviar el medio:', error);
      throw error;
    }
  }

  onAuth() {
    this.client.on('authenticated', () => {
      console.log('🔐 Cliente autenticado exitosamente');
    });
  }

  onAuthFailure() {
    this.client.on('auth_failure', (msg) => {
      console.error('❌ Fallo de autenticación:', msg);
      this.sessionQR = null;
    });
  }

  getQR() { return this.sessionQR; }



async eliminarDocumentoFirestore(docId) {
    try {
        const docRef = admin.firestore().collection('pedidosDisponibles1').doc(docId);
        await docRef.delete();
        console.log(`Documento con ID ${docId} eliminado de Firestore.`);
    } catch (error) {
        console.error(`Error al eliminar el documento con ID ${docId} de Firestore:`, error);
    }
}





  
  
}

module.exports = WhatsappWeb;
