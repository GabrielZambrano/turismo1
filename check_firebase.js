const admin = require('firebase-admin');
const serviceAccount = require('./bd.json');

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
}

async function checkFirebaseStatus() {
  try {
    const estadoRef = admin.firestore().collection('configuracion').doc('status');
    const estadoDoc = await estadoRef.get();
    
    if (!estadoDoc.exists) {
      await estadoRef.set({ estado: true });
      console.log('✅ Sistema activado');
    } else {
      const estado = estadoDoc.data().estado;
      console.log(`📊 Estado actual del sistema: ${estado}`);
      if (estado !== true) {
        await estadoRef.update({ estado: true });
        console.log('✅ Sistema activado');
      } else {
        console.log('✅ Sistema ya estaba activo');
      }
    }
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

checkFirebaseStatus();

