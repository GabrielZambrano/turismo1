const Server = require('./startup/Server');

// ----------------------------

const server = new Server();

server.listen();

server.onExit();