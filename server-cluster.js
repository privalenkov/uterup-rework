require('dotenv').config();

const cluster = require('cluster');
const http = require('http');
const os = require('os');
const { setupMaster, setupWorker } = require('@socket.io/sticky');
const { createAdapter, setupPrimary } = require('@socket.io/cluster-adapter');

const numWorkers = parseInt(process.env.WORKERS) || os.cpus().length;

const ConstantsShared = require('./src/shared/constants');
const MAX_PLAYERS =
  Number(process.env.PLAYER_MAX_COUNT || ConstantsShared.PLAYER_MAX_COUNT || 100);


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

  // Глобальный лимит подключений на весь кластер
  let clusterActiveConnections = 0;
  // Сколько открытых соединений держит каждый воркер (по PID)
  const workerConnCounts = new Map();

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
        if (!msg || !msg.cmd) return;
    
        if (msg.cmd === 'stats') {
          console.log(`📊 Worker #${workerId}: ${msg.lobbies} lobbies, ${msg.players} players`);
    
        } else if (msg.cmd === 'capacity_reserve') {
          // Воркеры спрашивают "можно ли принять ещё одно подключение?"
          const allow = clusterActiveConnections < MAX_PLAYERS;
          if (allow) {
            clusterActiveConnections++;
            const key = worker.process.pid;
            workerConnCounts.set(key, (workerConnCounts.get(key) || 0) + 1);
          }
          // Отвечаем ровно этому воркеру
          worker.send({ cmd: 'capacity_reply', reqId: msg.reqId, allow });
    
        } else if (msg.cmd === 'capacity_release') {
          // Воркеры сообщают, что соединение закрыто
          const key = worker.process.pid;
          const curr = workerConnCounts.get(key) || 0;
          if (curr > 0) {
            workerConnCounts.set(key, curr - 1);
            clusterActiveConnections = Math.max(0, clusterActiveConnections - 1);
          }
        }
      } catch (err) {
        // ignore
      }
    });

    worker.on('error', (err) => {
      console.error(`❌ Worker #${workerId} error:`, err.message);
    });
  }

  cluster.on('exit', (worker, code, signal) => {
    const workerInfo = workers[worker.process.pid];
    const workerId = workerInfo ? workerInfo.id : 'unknown';

    const key = worker.process.pid;
    const leaked = workerConnCounts.get(key) || 0;
    if (leaked > 0) {
      clusterActiveConnections = Math.max(0, clusterActiveConnections - leaked);
      workerConnCounts.delete(key);
    }
        
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
  const fs = require('fs');

  const Constants = require('./src/shared/constants');
  const { LobbyManager } = require('./src/server/lobby');
  const { DailyMapManager } = require('./src/server/dailyMap');
  const { createApiRouter } = require('./src/server/api');

  const workerId = process.env.WORKER_ID || cluster.worker.id;
  
  const app = express();
  app.use(express.json());

  // ЕДИНЫЙ API-роутер (должен стоять до раздачи статики и SPA-фоллбеков)
  const dailyMapManager = new DailyMapManager();
  app.use('/api', createApiRouter({
    dailyMapManager,
    onMapPublished: ({ date, map }) => {
      lobbyManager.setDailyMap(map);
      io.emit('map_updated', { date });
      // сообщим мастеру, чтобы разослал остальным воркерам
      try { process.send && process.send({ cmd: 'map_published' }); } catch {}
    },
  }));

  app.get(['/admin', '/admin/'], (req, res) => {
    res.redirect(302, '/admin.html');
  });

  // Статика / dev middleware
  const isDevelopment = process.env.NODE_ENV === 'development';

  if (isDevelopment) {
    const webpack = require('webpack');
    const webpackDevMiddleware = require('webpack-dev-middleware');
    const webpackConfig = require('./webpack.dev.js');
    const compiler = webpack(webpackConfig);
    app.use(webpackDevMiddleware(compiler));
    app.use(express.static('public'));
  } else {
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

  // ===== Cluster capacity gate =====
  let _capReqSeq = 0;
  const _capPending = new Map();

  function reserveClusterSlot(timeoutMs = 800) {
    return new Promise((resolve) => {
      const reqId = ++_capReqSeq;
      _capPending.set(reqId, resolve);
      try {
        process.send && process.send({ cmd: 'capacity_reserve', reqId });
      } catch (_) {}

      // Fail-closed: если мастер не ответил быстро — считаем, что нельзя
      const t = setTimeout(() => {
        if (_capPending.has(reqId)) {
          _capPending.delete(reqId);
          resolve(false);
        }
      }, timeoutMs);

      // Когда придёт ответ — снимем таймер в обработчике ниже
      _capPending.get(reqId)._timer = t; // слегка грязно, но компактно
    });
  }

  function releaseClusterSlot() {
    try { process.send && process.send({ cmd: 'capacity_release' }); } catch (_) {}
  }

  process.on('message', (msg) => {
    try {
      if (!msg || msg.cmd !== 'capacity_reply') return;
      const { reqId, allow } = msg;
      const entry = _capPending.get(reqId);
      if (!entry) return;
      clearTimeout(entry._timer);
      _capPending.delete(reqId);
      entry(!!allow);
    } catch (_) {}
  });

  // Middleware: спрашиваем у мастера, можно ли принять ещё одно соединение
  io.use(async (socket, next) => {
    const client = socket.conn;
    if (client.__permit) return next(); // уже считали этот engine.io-клиент

    const ok = await reserveClusterSlot();
    if (!ok) {
      const err = new Error('server_full');
      err.data = { message: 'Server is full' };
      return next(err);
    }

    client.__permit = true;
    client.once('close', () => {
      releaseClusterSlot();
    });

    next();
  });
  // ===== /Cluster capacity gate =====

  // КРИТИЧЕСКИ ВАЖНО: настраиваем cluster adapter
  io.adapter(createAdapter());

  // КРИТИЧЕСКИ ВАЖНО: настраиваем sticky для worker
  setupWorker(io);

  console.log(`🎮 Worker #${workerId} (PID: ${process.pid}) initialized`);

  // Создаем менеджер лобби с учетом карты дня
  const dailyMapData = dailyMapManager.getDailyMap();
  const lobbyManager = new LobbyManager(dailyMapData ? dailyMapData.map : null);

  if (dailyMapData) {
    console.log(`📍 Using daily map #${dailyMapData.mapNumber} for lobbies`);
  } else {
    console.log('⚠️ No daily map available - lobbies will use generated maps');
  }

  global.getLobbyManagerStats = () => lobbyManager.getStats();

  io.on('connection', socket => {
    console.log(`[Worker #${workerId}] ✅ Player connected: ${socket.id}`);

    socket.on(Constants.MSG_TYPES.JOIN_GAME, username => {
      // Проверяем наличие карты дня
      const dailyMap = dailyMapManager.getDailyMap();
      if (!dailyMap) {
        socket.emit('no_map', { message: 'Карта на сегодня не опубликована' });
        setTimeout(() => socket.disconnect(true), 1000);
        return;
      }

      const success = lobbyManager.addPlayer(socket, username);
      
      if (!success) {
        socket.emit('join_failed', { reason: 'Could not join any lobby' });
        setTimeout(() => socket.disconnect(true), 1000);
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
        const stats = global.getLobbyManagerStats ? global.getLobbyManagerStats() : { lobbies: 0, players: 0 };
        if (process.connected) {
          process.send({ cmd: 'stats', lobbies: stats.lobbies, players: stats.players });
        }
      } else if (msg && msg.cmd === 'reload_map') {
        // перечитаем сегодняшнюю карту с диска и применим
        const daily = dailyMapManager.getDailyMap();
        if (daily && daily.map) {
          lobbyManager.setDailyMap(daily.map);
          io.emit('map_updated', { date: daily.date });
        }
      }
    } catch (err) {
      // Игнорируем
    }
  });
}
