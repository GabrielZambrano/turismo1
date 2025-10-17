const { body, validationResult } = require('express-validator');
const WhatsappWeb = require('../api/WhatsappWeb');
const fs = require('fs');
const path1 = require('path'); // AsegÃºrate de importar el mÃ³dulo 'path'

class Routes {
  constructor(server) {
    this.server = server;
    this.whatsWeb = new WhatsappWeb();
    this.initializeRoutes();
  }

  initializeRoutes() {
    // Servir archivos estáticos
    this.server.use('/public', require('express').static(path1.join(__dirname, '../public')));
    
    // Ruta principal para la interfaz web
    this.getQRInterface('/');
    
    this.postSendMessage('/app1/send/message');
    this.postSendMessage('/app1/send/group/message');
    this.postSendMedia('/app1/send/media');
    this.postSendMedia('/app1/send/group/media');
    this.postSendMediaUrl('/app1/send/media-url');
    this.getSessionQR('/app1/session-qr');
    this.postLogoutSession('/app1/logout-session');
    this.postSendAlert('/app1/send/alert');
    this.postSendFinalizar('/app1/send/finalizar');
    this.postSendDesbloqueo('/app1/send/desbloqueo');  // Nueva ruta añadida
    
    // Nuevas rutas para WhatsApp Cloud API webhook
    this.getWebhook('/webhook');
    this.postWebhook('/webhook');
  }

  checkErrors(req, res, next) {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).send({
        status: 'bad request',
        errors: errors.array()
      });
    }
    next();
  }

  postSendMessage(path) {
    this.server.post(path, [
      body('to').exists().isMobilePhone().notEmpty(),
      body('message').exists().isString().notEmpty(),
      body('coordenadas').optional(),
      this.checkErrors.bind(this)
    ], async (req, res) => {
      try {
        const { to, message, coordenadas } = req.body;
  
        let mensajeModificado = message;
  
        if (mensajeModificado === '!El Conductor ha llegado a su ubicación!') {
          mensajeModificado = '🚗 ¡El Conductor ha llegado a su ubicación! Por favor, esté atento a su llegada. 🚗';
        }
        
        if (mensajeModificado === '!Su viaje ha iniciado!') {
       //   mensajeModificado = '🛣️ ¡Su viaje ha iniciado! Por favor, Buen Viaje. 🛣️';
        }
  
  
        if (coordenadas) {
          const googleMapsUrl = `https://www.google.com/maps/search/?api=1&query=${coordenadas}`;
          mensajeModificado = `${mensajeModificado}\nGoogle Maps: ${googleMapsUrl}`;
        }
  
        const isGroup = path.includes('group');
  
        await this.whatsWeb.sendMessage(to, mensajeModificado, isGroup, null);
        res.status(200).send({ status: 'success' });
      } catch (err) {
        console.error(err);
        res.status(500).send({ status: 'server error' });
      }
    });
  }
  
 postSendDesbloqueo(path) {
    this.server.post(path, [
      body('to').exists().isString().notEmpty(),
      body('message').exists().isString().notEmpty(),
      body('numero').exists().notEmpty(),
      body('idconductor').exists().notEmpty(),
      this.checkErrors.bind(this)
    ], async (req, res) => {
      try {
        const { to, message, numero, idconductor } = req.body;

        // Agregar logs para depuración
        console.log(`Datos recibidos: to=${to}, message=${message}, numero=${numero}, idconductor=${idconductor}`);
        
        // Enviar mensaje utilizando WhatsApp Cloud API
        await this.whatsWeb.sendMessage(to, message, false);
        
        res.status(200).send({ status: 'success' });
      } catch (error) {
        console.error('Error al enviar mensaje:', error);
        res.status(500).send({ status: 'server error' });
      }
    });
  }


 async enviarMensajeFinalizar(to, message, numero, idconductor) {
    // Implementaci�n de enviarMensajeFinalizar
    console.log(`Enviando mensaje a ${to} con el mensaje: ${message}, n�mero: ${numero}, idconductor: ${idconductor}`);
    return this.whatsWeb.sendMessage(to, message, false, null);
  }

   postSendFinalizar(path) {
        this.server.post(path, [
            body('to').exists().isString().notEmpty(),
            body('message').exists().isString().notEmpty(),
            body('idviajes').exists().notEmpty(),
            body('idconductor').exists().notEmpty(),
            this.checkErrors.bind(this)
        ], async (req, res) => {
            try {
                const { to, message, idviajes, idconductor } = req.body;
                const isGroup = to.includes('-');

                // Mostrar en consola los datos recibidos
                console.log(`Datos recibidos: to=${to}, message=${message}, idviajes=${idviajes}, idconductor=${idconductor}`);

                // Enviar mensaje a través de WhatsApp
                await this.whatsWeb.sendMessage(to, "🎉 Viaje finalizado con éxito! 🚖 Gracias por preferirnos. Califica nuestro servicio aquí: https://turismoapp.xyz/calificar/ ⭐");


                res.status(200).send('success');
            } catch (error) {
                console.error('Error al enviar el mensaje:', error);
                res.status(500).send('Error al enviar el mensaje');
            }
        });
    }




  /**
   * Método para verificar el webhook de WhatsApp Cloud API
   * @param {string} path - Ruta del endpoint
   */
  getWebhook(path) {
    this.server.get(path, (req, res) => {
      try {
        const mode = req.query['hub.mode'];
        const token = req.query['hub.verify_token'];
        const challenge = req.query['hub.challenge'];
        
        // Obtener el token de verificación del webhook desde variables de entorno
        const verificationToken = process.env.WEBHOOK_VERIFICATION_TOKEN || 'your_verification_token';
        
        if (mode === 'subscribe' && token === verificationToken) {
          console.log('Webhook verificado correctamente');
          return res.status(200).send(challenge);
        } else {
          console.error('Error de verificación del webhook:', { mode, token });
          return res.sendStatus(403);
        }
      } catch (err) {
        console.error('Error en getWebhook:', err);
        res.status(500).send({ status: 'server error' });
      }
    });
  }
  
  /**
   * Método para procesar mensajes entrantes desde WhatsApp Cloud API
   * @param {string} path - Ruta del endpoint
   */
  postWebhook(path) {
    this.server.post(path, async (req, res) => {
      try {
        console.log('Webhook recibido:', JSON.stringify(req.body, null, 2));
        
        // Verificar si hay un mensaje entrante
        const change = req.body.entry?.[0]?.changes?.[0];
        const msg = change?.value?.messages?.[0];
        
        if (!msg) {
          // No hay mensaje para procesar, puede ser otro tipo de notificación
          console.log('No hay mensaje en la notificación del webhook');
          return res.sendStatus(200);
        }
        
        // Obtener el número de teléfono del remitente
        const from = msg?.from;
        
        // Obtener información del contacto
        const contactName = change?.value?.contacts?.[0]?.profile?.name || 'Cliente';
        
        console.log(`Mensaje recibido de ${contactName} (${from})`);
        
        // Procesar mensaje de texto
        if (msg?.text?.body) {
          const text = msg.text.body;
          console.log(`Texto recibido: ${text}`);
          
          // Aquí podrías implementar la lógica para responder a mensajes específicos
          // Por ejemplo:
          if (text.toLowerCase().includes('hola')) {
            await this.whatsWeb.sendMessage(
              from, 
              `¡Hola ${contactName}! Gracias por contactarnos. ¿En qué podemos ayudarte?`, 
              false
            );
          }
        } 
        // Procesar ubicación
        else if (msg?.location) {
          const { latitude, longitude } = msg.location;
          console.log(`Ubicación recibida: ${latitude}, ${longitude}`);
          
          // Aquí podrías implementar la lógica para procesar ubicaciones
        }
        
        return res.sendStatus(200);
      } catch (error) {
        console.error('Error en postWebhook:', error);
        return res.sendStatus(500);
      }
    });
  }

  postSendMedia(path) {
    this.server.post(path, [
      body('to').exists().isMobilePhone().notEmpty(),
      body('filename').exists().isString().notEmpty(),
      this.checkErrors.bind(this)
    ], async (req, res) => {
      try {
        const { to, filename, caption } = req.body;
        const isGroup = path.includes('group');
        await this.whatsWeb.sendMedia(to, filename, isGroup, caption);
        res.status(200).send({ status: 'success' });
      } catch (err) {
        console.error(err);
        res.status(500).send({ status: 'server error' });
      }
    });
  }

  postSendMediaUrl(path) {
    this.server.post(path, [
      body('to').exists().isMobilePhone().notEmpty(),
      body('mediaUrl').exists().isURL().notEmpty(),
      body('caption').optional().isString(),
      this.checkErrors.bind(this)
    ], async (req, res) => {
      try {
      
        const
         { to, caption, mediaUrl } = req.body;
        const telefono = to.split('@')[0];
        //const filePath = path1.join(__dirname, '..pedidos', `${telefono}.json`);  // Ajuste de la ruta para el archivo en el directorio raÃ­z
        const filePath = path1.join(__dirname, '..', 'api/pedidos', `${telefono}.json`);  // Ajuste de la ruta para el archivo en el directorio pedidos

        // Asegurarse de que WhatsappWeb tiene el mÃ©todo sendMedia definido
        if (typeof this.whatsWeb.sendMedia !== 'function') {
          throw new Error('El mÃ©todo sendMedia no estÃ¡ definido en WhatsappWeb');
        }

        // Enviar el medio utilizando el mÃ©todo sendMedia
        await this.whatsWeb.sendMedia(to, mediaUrl, false, caption);

        // Modificar el archivo JSON para cambiar el estado a "aceptado"
        if (fs.existsSync(filePath)) {
          const data = fs.readFileSync(filePath, 'utf8');
          const pedido = JSON.parse(data);
          pedido.estado = 'aceptado';
          fs.writeFileSync(filePath, JSON.stringify(pedido, null, 2));
        } else {
          console.error(`No se encontrÃ³ el archivo: ${filePath}`);
        }

        res.status(200).send({
          status: 'success',
          data: { to, caption, mediaUrl }
        });
      } catch (error) {
        console.error('Error al enviar el mensaje:', error);
        res.status(500).send({ status: 'error', message: 'Error al enviar el mensaje' });
      }
    });
  }

  getSessionQR(path) {
    this.server.get(path, (req, res) => {
      try {
        const qr = this.whatsWeb.getQR();
        
        if (qr) {
          // QR disponible como data URL
          res.status(200).send({ 
            status: 'success', 
            qr: qr,
            message: 'QR disponible' 
          });
        } else {
          // Verificar si el cliente ya está conectado
          const isReady = this.whatsWeb.client && this.whatsWeb.client.info;
          
          if (isReady) {
            res.status(200).send({ 
              status: 'success', 
              qr: null, 
              message: 'Cliente ya conectado' 
            });
          } else {
            res.status(200).send({ 
              status: 'waiting', 
              qr: null, 
              message: 'Esperando código QR...' 
            });
          }
        }
      } catch (err) {
        console.error('Error en getSessionQR:', err);
        res.status(500).send({ 
          status: 'error', 
          qr: null, 
          message: 'Error del servidor' 
        });
      }
    });
  }

  postSendAlert(path) {
    this.server.post(path, [
      body('to').exists().notEmpty(),
      body('message').exists().isString().notEmpty(),
      body('coordenadas').optional(),
      this.checkErrors.bind(this)
    ], async (req, res) => {
      try {
        const { to, message, coordenadas } = req.body;

        let mensajeModificado = message;
        if (coordenadas) {
          const googleMapsUrl = `https://www.google.com/maps/search/?api=1&query=${coordenadas}`;
          mensajeModificado = `${message}\nGoogle Maps: ${googleMapsUrl}`;
        }

        const isGroup = to.includes('-');
        await this.whatsWeb.sendMessage(to, mensajeModificado, isGroup, null);
        res.status(200).send({ status: 'success' });
      } catch (err) {
        console.error(err);
        res.status(500).send({ status: 'server error' });
      }
    });
  }

  getQRInterface(path) {
    this.server.get(path, (req, res) => {
      try {
        const filePath = path1.join(__dirname, '../public/index.html');
        res.sendFile(filePath);
      } catch (err) {
        console.error(err);
        res.status(500).send({ status: 'server error' });
      }
    });
  }

  postLogoutSession(path) {
    this.server.post(path, (req, res) => {
      try {
        console.log('🔄 Iniciando cierre de sesión de WhatsApp...');
        
        // Función para eliminar la carpeta de sesión y reiniciar
        const logoutAndRestart = async () => {
          const { exec } = require('child_process');
          const fs = require('fs');
          const path = require('path');
          
          try {
            // Ruta de la carpeta de sesión
            const sessionPath = path1.join(__dirname, '../.wwebjs_auth');
            
            // Verificar si la carpeta existe
            if (fs.existsSync(sessionPath)) {
              console.log('📁 Eliminando carpeta de sesión...');
              
              // Eliminar carpeta de sesión
              exec(`rm -rf "${sessionPath}"`, (error) => {
                if (error) {
                  console.error('Error eliminando carpeta de sesión:', error);
                } else {
                  console.log('✅ Carpeta de sesión eliminada');
                  
                  // Esperar 3 segundos y reiniciar con PM2
                  setTimeout(() => {
                    console.log('🔄 Reiniciando servidor con PM2...');
                    exec('pm2 restart turismo-whatsapp', (restartError) => {
                      if (restartError) {
                        console.error('Error reiniciando con PM2:', restartError);
                      } else {
                        console.log('✅ Servidor reiniciado exitosamente');
                      }
                    });
                  }, 3000);
                }
              });
            } else {
              console.log('⚠️ Carpeta de sesión no encontrada');
              // Reiniciar de todos modos
              setTimeout(() => {
                exec('pm2 restart turismo-whatsapp', (restartError) => {
                  if (restartError) {
                    console.error('Error reiniciando con PM2:', restartError);
                  } else {
                    console.log('✅ Servidor reiniciado exitosamente');
                  }
                });
              }, 2000);
            }
          } catch (error) {
            console.error('Error en proceso de logout:', error);
          }
        };
        
        // Ejecutar el logout
        logoutAndRestart();
        
        res.status(200).send({ 
          status: 'success', 
          message: 'Cerrando sesión y reiniciando servidor...' 
        });
        
      } catch (err) {
        console.error('Error en logout:', err);
        res.status(500).send({ 
          status: 'error', 
          message: 'Error al cerrar sesión' 
        });
      }
    });
  }
}

module.exports = Routes;
