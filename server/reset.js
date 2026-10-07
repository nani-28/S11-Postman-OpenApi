const db = require('./db');

db.initDatabase();
const result = db.resetDatabase();
console.log('Datos de prueba reiniciados.', result);
