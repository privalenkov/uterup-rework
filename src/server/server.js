require('dotenv').config();

const express = require('express');
const webpack = require('webpack');
const webpackDevMiddleware = require('webpack-dev-middleware');
const { createServer } = require('http');
const { Server } = require('socket.io');
const { createAdapter } = require('@socket.io/redis-adapter');
const { createClient } = require('redis');
const path = require('path');
const Constants = require('../shared/constants');
const { LobbyManager } = require('./lobby');

const app = express();
app.use(express.static('public'));

const isDevelopment = process.env.NODE_ENV === 'development';

if (isDevelopment) {
  console.log('🔧 Development mode: using webpack-dev-middleware');
  const webpackConfig = require('../../webpack.dev.js');
  const compiler = webpack(webpackConfig);
  app.use(webpackDevMiddleware(compiler));
} else {
  console.log('🚀 Production mode: serving from dist/');
  
  const fs = require('fs');
  if (!fs.existsSync(path.join(__dirname, '../../dist'))) {
    console.error('❌ ERROR: dist/ folder not found!');
    console.error('   Run "npm run build" first!');
    process.exit(1);
  }
  
  app.use(express.static('dist'));
}

const port = parseInt(process.env.PORT) || 3000;
const httpServer = createServer(app);

const workerId = process.env.WORKER_ID || 'single';

// Создаем Socket.IO сервер
const io = new Server(httpServer, {
  transports: ['websocket', 'polling'],
  pingTimeout: 60000,
  pingInterval: 25000,
  upgradeTimeout: 30000,
  maxHttpBufferSize: 1e6,
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  },
  // ВАЖНО: настройки для работы с cluster
  allowEIO3: true,
  perMessageDeflate: false
});

// Функция для инициализации Redis адаптера (для cluster)
async function setupRedisAdapter() {
  if (process.env.USE_REDIS === 'true') {
    try {
      const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
      
      const pubClient = createClient({ url: redisUrl });
      const subClient = pubClient.duplicate();

      await Promise.all([pubClient.connect(), subClient.connect()]);

      io.adapter(createAdapter(pubClient, subClient));
      
      console.log(`✅ Worker #${workerId} connected to Redis for Socket.IO`);
    } catch (err) {
      console.error(`❌ Worker #${workerId} failed to connect to Redis:`, err.message);
      console.log(`⚠️  Running without Redis adapter (cluster may not work correctly)`);
    }
  }
}

// Инициализируем адаптер если нужно
setupRedisAdapter().then(() => {
  // Запускаем HTTP сервер только после настройки адаптера
  httpServer.listen(port, () => {
    console.log(`✅ Worker #${workerId} listening on port ${port}`);
  });
}).catch(err => {
  console.error(`❌ Worker #${workerId} failed to start:`, err);
  process.exit(1);
});

// Создаем менеджер лобби
const lobbyManager = new LobbyManager();

// Экспортируем функцию получения статистики
global.getLobbyManagerStats = () => lobbyManager.getStats();

io.on('connection', socket => {
  console.log(`[Worker #${workerId}] Player connected:`, socket.id);

  socket.on(Constants.MSG_TYPES.JOIN_GAME, username => {
    const success = lobbyManager.addPlayer(socket, username);
    
    if (!success) {
      socket.emit('join_failed', { reason: 'Could not join any lobby' });
      
      // Отключаем игрока через небольшую задержку
      setTimeout(() => {
        socket.disconnect(true);
      }, 1000);
    }
  });

  socket.on(Constants.MSG_TYPES.INPUT, input => {
    lobbyManager.handleInput(socket, input);
  });

  socket.on('get_lobbies', () => {
    socket.emit('lobbies_list', {
      lobbies: lobbyManager.getAllLobbies(),
      totalPlayers: lobbyManager.getTotalPlayers()
    });
  });

  socket.on('disconnect', () => {
    console.log(`[Worker #${workerId}] Player disconnected:`, socket.id);
    lobbyManager.removePlayer(socket);
  });
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log(`[Worker #${workerId}] Received SIGTERM, shutting down...`);
  io.close(() => {
    httpServer.close(() => {
      console.log(`[Worker #${workerId}] Server closed`);
      process.exit(0);
    });
  });
});

module.exports = { server: httpServer, io, lobbyManager };