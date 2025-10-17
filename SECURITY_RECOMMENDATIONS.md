# 🔒 Recomendaciones de Seguridad Críticas

## ⚠️ ATENCIÓN: Credenciales Expuestas

### Problema Identificado
El archivo `bd.json` contiene credenciales completas de Firebase incluyendo:
- ✅ Clave privada completa
- ✅ Email de servicio
- ✅ IDs de proyecto
- ✅ URLs de autenticación

### 🚨 ACCIÓN REQUERIDA INMEDIATA

#### 1. **Mover Credenciales a Variables de Entorno**

Crear archivo `.env` (NO incluir en Git):

```env
# Firebase Configuration
FIREBASE_PROJECT_ID=appecdriver
FIREBASE_PRIVATE_KEY_ID=9958739b7bf5c60e91143dadce1923b99303597d
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nMIIEvgIBADANBgkqhkiG9w0BAQEFAASCBKgwggSkAgEAAoIBAQC+PVvwR1YVMHo2\n[... resto de la clave privada ...]\n-----END PRIVATE KEY-----\n"
FIREBASE_CLIENT_EMAIL=firebase-adminsdk-7pacd@appecdriver.iam.gserviceaccount.com
FIREBASE_CLIENT_ID=116216698079623237605
FIREBASE_AUTH_URI=https://accounts.google.com/o/oauth2/auth
FIREBASE_TOKEN_URI=https://oauth2.googleapis.com/token
FIREBASE_AUTH_PROVIDER_X509_CERT_URL=https://www.googleapis.com/oauth2/v1/certs
FIREBASE_CLIENT_X509_CERT_URL=https://www.googleapis.com/robot/v1/metadata/x509/firebase-adminsdk-7pacd%40appecdriver.iam.gserviceaccount.com

# WhatsApp Configuration
WA_PHONE_NUMBER_ID=tu_phone_number_id
CLOUD_API_ACCESS_TOKEN=tu_access_token
WEBHOOK_VERIFICATION_TOKEN=tu_webhook_token

# Database Configuration
DB_HOST=localhost
DB_USER=root
DB_PASSWORD=
DB_NAME=chasqui210722
```

#### 2. **Actualizar Código para Usar Variables de Entorno**

Reemplazar en `api/WhatsappWeb.js`:

```javascript
// ANTES (INSEGURO):
const serviceAccount = require('../bd.json');

// DESPUÉS (SEGURO):
const serviceAccount = {
  type: "service_account",
  project_id: process.env.FIREBASE_PROJECT_ID,
  private_key_id: process.env.FIREBASE_PRIVATE_KEY_ID,
  private_key: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
  client_email: process.env.FIREBASE_CLIENT_EMAIL,
  client_id: process.env.FIREBASE_CLIENT_ID,
  auth_uri: process.env.FIREBASE_AUTH_URI,
  token_uri: process.env.FIREBASE_TOKEN_URI,
  auth_provider_x509_cert_url: process.env.FIREBASE_AUTH_PROVIDER_X509_CERT_URL,
  client_x509_cert_url: process.env.FIREBASE_CLIENT_X509_CERT_URL
};
```

#### 3. **Actualizar .gitignore**

Agregar al `.gitignore`:

```gitignore
# Environment variables
.env
.env.local
.env.production
.env.development

# Firebase credentials
bd.json
firebase-adminsdk-*.json

# Logs
*.log
logs/

# Runtime data
pids
*.pid
*.seed
*.pid.lock

# Coverage directory used by tools like istanbul
coverage/

# Dependency directories
node_modules/
```

#### 4. **Eliminar Credenciales del Repositorio**

```bash
# Eliminar archivo sensible del historial de Git
git rm --cached bd.json
git commit -m "Remove sensitive credentials file"

# Si ya está en el repositorio remoto:
git filter-branch --force --index-filter 'git rm --cached --ignore-unmatch bd.json' --prune-empty --tag-name-filter cat -- --all
```

### 🔐 Mejores Prácticas Adicionales

#### 1. **Configuración de Producción**
```javascript
// Configuración segura para producción
const isProduction = process.env.NODE_ENV === 'production';

const config = {
  port: process.env.PORT || 3009,
  firebase: {
    // Usar variables de entorno
    credential: admin.credential.cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    })
  },
  whatsapp: {
    phoneNumberId: process.env.WA_PHONE_NUMBER_ID,
    accessToken: process.env.CLOUD_API_ACCESS_TOKEN,
    webhookToken: process.env.WEBHOOK_VERIFICATION_TOKEN
  }
};
```

#### 2. **Validación de Variables de Entorno**
```javascript
// Validar que todas las variables necesarias estén presentes
const requiredEnvVars = [
  'FIREBASE_PROJECT_ID',
  'FIREBASE_PRIVATE_KEY',
  'FIREBASE_CLIENT_EMAIL',
  'WA_PHONE_NUMBER_ID',
  'CLOUD_API_ACCESS_TOKEN'
];

const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);

if (missingVars.length > 0) {
  console.error('❌ Faltan variables de entorno:', missingVars.join(', '));
  process.exit(1);
}
```

#### 3. **Logging Seguro**
```javascript
// NO hacer esto:
console.log('Token:', process.env.ACCESS_TOKEN);

// Hacer esto:
console.log('Token:', process.env.ACCESS_TOKEN ? 'CONFIGURADO' : 'NO CONFIGURADO');
```

### 🛡️ Configuración de Servidor Segura

#### 1. **Usar HTTPS en Producción**
```javascript
const express = require('express');
const https = require('https');
const fs = require('fs');

if (process.env.NODE_ENV === 'production') {
  const options = {
    key: fs.readFileSync('path/to/private-key.pem'),
    cert: fs.readFileSync('path/to/certificate.pem')
  };
  
  https.createServer(options, app).listen(443);
}
```

#### 2. **Configurar CORS Apropiadamente**
```javascript
const cors = require('cors');

app.use(cors({
  origin: process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000'],
  credentials: true
}));
```

#### 3. **Rate Limiting**
```javascript
const rateLimit = require('express-rate-limit');

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 100 // límite de 100 requests por ventana
});

app.use('/api/', limiter);
```

### 📝 Checklist de Seguridad

- [ ] ✅ Mover credenciales a variables de entorno
- [ ] ✅ Actualizar .gitignore
- [ ] ✅ Eliminar bd.json del repositorio
- [ ] ✅ Validar variables de entorno en startup
- [ ] ✅ Configurar HTTPS en producción
- [ ] ✅ Implementar rate limiting
- [ ] ✅ Configurar CORS apropiadamente
- [ ] ✅ Logging seguro (sin credenciales)
- [ ] ✅ Backup seguro de credenciales
- [ ] ✅ Rotación periódica de tokens

### 🚨 URGENTE: Acciones Inmediatas

1. **Crear archivo .env** con todas las credenciales
2. **Actualizar código** para usar variables de entorno
3. **Eliminar bd.json** del repositorio
4. **Regenerar credenciales** si es posible (recomendado)
5. **Revisar logs** para credenciales expuestas

### 📞 Contacto de Emergencia

Si sospechas que las credenciales han sido comprometidas:

1. **Deshabilitar inmediatamente** el serviceAccount en Firebase Console
2. **Generar nuevas credenciales** de servicio
3. **Cambiar tokens** de WhatsApp Business API
4. **Revisar actividad** sospechosa en Firebase Analytics

---

## ⚠️ RECORDATORIO IMPORTANTE

**Las credenciales expuestas pueden permitir acceso completo a tu base de datos Firebase y servicios de WhatsApp. Esta es una vulnerabilidad crítica que debe ser resuelta inmediatamente.** 