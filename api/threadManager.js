const fs = require('fs');
const path = './threads.json';

function leerHilos() {
  if (fs.existsSync(path)) {
    const data = fs.readFileSync(path, 'utf8');
    return JSON.parse(data);
  } else {
    return {};
  }
}

function guardarHilos(hilos) {
  fs.writeFileSync(path, JSON.stringify(hilos, null, 4), 'utf8');
}

async function getOrCreateThreadIdForUser(userId, openai) {
  let hilos = leerHilos();
  if (!hilos[userId]) {
    try {
      const newThread = await openai.beta.threads.create();
      hilos[userId] = newThread.id;
      guardarHilos(hilos);
    } catch (error) {
      console.error('Error al crear nuevo thread:', error);
      throw error;
    }
  }
  return hilos[userId];
}

module.exports = { getOrCreateThreadIdForUser };
