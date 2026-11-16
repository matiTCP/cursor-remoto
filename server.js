// Modo sin interfaz: `npm start`. La app de escritorio (`npm run desktop`) usa
// el mismo servidor desde src/server.js.
const path = require('path');
const { MouseServer, lanAddresses } = require('./src/server');

const server = new MouseServer({
  // config.json no va en el repo (tiene tu PIN): en un clon nuevo se crea desde el ejemplo.
  configPath: path.join(__dirname, 'config.json'),
  dataDir: __dirname,
});

server.on('log', (line) => {
  if (line.startsWith('Escuchando')) return; // abajo se imprime con las direcciones
  process.stdout.write(line.endsWith('\n') ? line : `${line}\n`);
});

server.start().then(({ port }) => {
  console.log(`Mouse_Final escuchando en el puerto ${port}`);
  for (const { address } of lanAddresses()) {
    console.log(`  -> Abri desde el celular (misma red WiFi): http://${address}:${port}`);
  }
}).catch((err) => {
  console.error(err.code === 'EADDRINUSE'
    ? 'El puerto ya está en uso: ¿hay otra copia de Mouse Final abierta?'
    : `No se pudo iniciar el servidor: ${err.message}`);
  process.exit(1);
});

process.on('SIGINT', async () => {
  await server.stop();
  process.exit(0);
});
