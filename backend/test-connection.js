require('dotenv').config();
const db = require('./src/config/db');

console.log('Variables de entorno:');
console.log('DB_USER:', process.env.DB_USER);
console.log('DB_HOST:', process.env.DB_HOST);
console.log('DB_NAME:', process.env.DB_NAME);
console.log('PUBLIC_USER_ID:', process.env.PUBLIC_USER_ID);

console.log('\nProbando conexión a base de datos...');

db.query('SELECT 1 as test', (err, results) => {
  if (err) {
    console.error('❌ Error de conexión:', err.message);
    process.exit(1);
  } else {
    console.log('✅ Conexión exitosa a MySQL');
    console.log('Resultado:', results);
    process.exit(0);
  }
});
