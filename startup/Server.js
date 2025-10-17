const express = require('express');
const cors = require('cors');

const Routes = require('./Routes');

// ------------------------

class Server {

  constructor() {
    this.port = process.env.PORT || 3005;
    this.server = express();
    this.middlewares();
    this.routes = new Routes(this.server);
  }

  middlewares() {
    this.server.use(cors());
    this.server.use(express.urlencoded({ extended: true }));
    this.server.use(express.json()); // Agregar soporte para JSON
  }

  listen() {
    this.server.listen(this.port, () => {
      console.log('listening on port', this.port);
    });
  }

  onExit() {
    process.on('SIGINT', (err) => {
      console.log('exit server');
      process.exit(err ? 1 : 0);
    });
  }

}

module.exports = Server;