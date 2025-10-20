require('dotenv').config();

const cluster = require('cluster');
const http = require('http');
const os = require('os');
const { setupMaster, setupWorker } = require('@socket.io/sticky');
const { createAdapter, setupPrimary } = require('@socket.io/cluster-adapter');

const numWorkers = parseInt(process.env.WORKERS) || os.cpus().length;

if (cluster.isMaster || cluster.isPrimary) {
  console.log('╔════════════════════════════════════════════════════════╗');
  console.log('║       Jump King Server - Cluster Mode 🚀              ║');
  console.log('╚════════════════════════════════════════════════════════╝\n');
  
  console.log(`🎯 Master process: ${process.pid}`);
  console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`💻 CPU cores detected: ${os.cpus().length}`);
  console.log(`⚡ Starting ${numWorkers} worker processes...\n`);

  const port = parseInt(process.env.PORT) || 3000;
  
  // Создаем HTTP сервер для балансировки
  const httpServer = http.createServer();

  // Настраиваем sticky sessions
  setupMaster(httpServer, {
    loadBalancingMethod: 'least-connection',
  });

  // Настраиваем cluster adapter
  setupPrimary();

  // Запускаем сервер
  httpServer.listen(port, () => {
    console.log(`✅ Master HTTP server listening on port ${port}\n`);
  });

  const workers = {};
  let nextWorkerId = 1;

  // Создаем workers
  for (let i = 0; i < numWorkers; i++) {
    const workerId = nextWorkerId++;
    const worker = cluster.fork({ WORKER_ID: workerId });
    
    workers[worker.process.pid] = {
      worker: worker,
      id: workerId
    };
    
    console.log(`✅ Worker #${workerId} (PID: ${worker.process.pid}) started`);

    worker.on('message', (msg) => {
      try {
        if (msg && msg.cmd === 'stats') {
          console.log(`📊 Worker #${workerId}: ${msg.lobbies} lobbies, ${msg.players} players`);
        }
      } catch (err) {
        // Игнорируем
      }
    });

    worker.on('error', (err) => {
      console.error(`❌ Worker #${workerId} error:`, err.message);
    });
  }

  cluster.on('exit', (worker, code, signal) => {
    const workerInfo = workers[worker.process.pid];
    const workerId = workerInfo ? workerInfo.id : 'unknown';
    
    console.log(`\n❌ Worker #${workerId} died (${signal || code})`);
    delete workers[worker.process.pid];
    
    if (signal !== 'SIGTERM' && signal !== 'SIGINT') {
      console.log(`🔄 Restarting worker...`);
      setTimeout(() => {
        const newWorkerId = nextWorkerId++;
        const newWorker = cluster.fork({ WORKER_ID: newWorkerId });
        workers[newWorker.process.pid] = {
          worker: newWorker,
          id: newWorkerId
        };
        console.log(`✅ Worker #${newWorkerId} (PID: ${newWorker.process.pid}) restarted`);
      }, 1000);
    }
  });

  // Статистика каждые 30 секунд
  const statsInterval = setInterval(() => {
    const activeWorkers = Object.keys(workers).length;
    console.log(`\n${'='.repeat(60)}`);
    console.log(`📈 Cluster statistics:`);
    console.log(`   Active workers: ${activeWorkers}/${numWorkers}`);
    console.log(`   Uptime: ${Math.floor(process.uptime())}s`);
    console.log(`   Memory: ${Math.round(process.memoryUsage().heapUsed / 1024 / 1024)}MB`);
    
    Object.values(workers).forEach(({ worker }) => {
      try {
        if (worker.isConnected()) {
          worker.send({ cmd: 'getStats' });
        }
      } catch (err) {
        // Игнорируем
      }
    });
  }, 30000);

  // Graceful shutdown
  const shutdown = (signal) => {
    console.log(`\n🛑 Received ${signal}, shutting down...`);
    clearInterval(statsInterval);
    
    Object.values(workers).forEach(({ worker }) => {
      try {
        worker.kill('SIGTERM');
      } catch (err) {
        // Игнорируем
      }
    });
    
    setTimeout(() => {
      console.log('⏰ Force shutdown');
      process.exit(0);
    }, 5000);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

} else {
  // Worker процесс
  const express = require('express');
  const { createServer } = require('http');
  const { Server } = require('socket.io');
  const path = require('path');
  const Constants = require('./src/shared/constants');
  const { LobbyManager } = require('./src/server/lobby');

  const workerId = process.env.WORKER_ID || cluster.worker.id;
  
  const app = express();
  app.use(express.static('public'));

  const isDevelopment = process.env.NODE_ENV === 'development';

  if (isDevelopment) {
    const webpack = require('webpack');
    const webpackDevMiddleware = require('webpack-dev-middleware');
    const webpackConfig = require('./webpack.dev.js');
    const compiler = webpack(webpackConfig);
    app.use(webpackDevMiddleware(compiler));
  } else {
    const fs = require('fs');
    const distPath = path.join(__dirname, 'dist');
    if (!fs.existsSync(distPath)) {
      console.error('❌ ERROR: dist/ folder not found!');
      process.exit(1);
    }
    app.use(express.static('dist'));
  }

  const httpServer = createServer(app);
  
  const io = new Server(httpServer, {
    cors: {
      origin: '*',
      methods: ['GET', 'POST']
    },
    transports: ['websocket', 'polling'],
    allowUpgrades: true,
    pingTimeout: 60000,
    pingInterval: 25000
  });

  // КРИТИЧЕСКИ ВАЖНО: настраиваем cluster adapter
  io.adapter(createAdapter());

  // КРИТИЧЕСКИ ВАЖНО: настраиваем sticky для worker
  setupWorker(io);

  console.log(`🎮 Worker #${workerId} (PID: ${process.pid}) initialized`);

  // Создаем менеджер лобби
  const lobbyManager = new LobbyManager();

  global.getLobbyManagerStats = () => lobbyManager.getStats();

  io.on('connection', socket => {
    console.log(`[Worker #${workerId}] ✅ Player connected: ${socket.id}`);

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

    socket.on('disconnect', (reason) => {
      console.log(`[Worker #${workerId}] ❌ Player disconnected: ${socket.id} (${reason})`);
      lobbyManager.removePlayer(socket);
    });
  });

  // Обработка сообщений от master
  process.on('message', (msg) => {
    try {
      if (msg && msg.cmd === 'getStats') {
        const stats = global.getLobbyManagerStats 
          ? global.getLobbyManagerStats() 
          : { lobbies: 0, players: 0 };
        
        if (process.connected) {
          process.send({
            cmd: 'stats',
            lobbies: stats.lobbies,
            players: stats.players
          });
        }
      }
    } catch (err) {
      // Игнорируем
    }
  });
}