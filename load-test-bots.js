// load-test-bots.js
const io = require('socket.io-client');

// const SERVER_URL = 'http://localhost:3000';
const SERVER_URL = 'https://uterup-testwer-privalenkov.amvera.io';
const BOT_COUNT = 100;

class Bot {
  constructor(id) {
    this.id = id;
    this.username = `Bot_${id}`;
    this.socket = null;
    this.isConnected = false;
    this.jumpInterval = null;
    this.moveInterval = null;
    
    this.currentInput = {
      left: false,
      right: false,
      space: false
    };
  }

  connect() {
    console.log(`[Bot ${this.id}] Connecting...`);
    
    this.socket = io(SERVER_URL, {
      transports: ['websocket'],
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionAttempts: 5
    });

    this.socket.on('connect', () => {
      console.log(`[Bot ${this.id}] Connected!`);
      this.isConnected = true;
      
      // Присоединяемся к игре
      this.socket.emit('join_game', this.username);
      
      // Начинаем случайное поведение через небольшую задержку
      setTimeout(() => {
        this.startRandomBehavior();
      }, 1000);
    });

    this.socket.on('disconnect', (reason) => {
      console.log(`[Bot ${this.id}] Disconnected: ${reason}`);
      this.isConnected = false;
      this.stopBehavior();
    });

    this.socket.on('update', (data) => {
      // Получаем обновления от сервера (можно логировать для отладки)
      // console.log(`[Bot ${this.id}] Received update`);
    });

    this.socket.on('server_full', () => {
      console.log(`[Bot ${this.id}] Server is full!`);
      this.disconnect();
    });

    this.socket.on('connect_error', (error) => {
      console.error(`[Bot ${this.id}] Connection error:`, error.message);
    });
  }

  startRandomBehavior() {
    // Случайное движение влево/вправо
    this.moveInterval = setInterval(() => {
      const action = Math.random();
      
      if (action < 0.3) {
        // Идем влево
        this.currentInput.left = true;
        this.currentInput.right = false;
      } else if (action < 0.6) {
        // Идем вправо
        this.currentInput.left = false;
        this.currentInput.right = true;
      } else {
        // Стоим на месте / устанавливаем направление для прыжка
        const rand = Math.random();
        if (rand < 0.33) {
          this.currentInput.left = true;
          this.currentInput.right = false;
        } else if (rand < 0.66) {
          this.currentInput.left = false;
          this.currentInput.right = true;
        } else {
          this.currentInput.left = false;
          this.currentInput.right = false;
        }
      }
      
      this.sendInput();
    }, 200 + Math.random() * 300); // Каждые 200-500мс меняем направление

    // Случайные прыжки
    this.jumpInterval = setInterval(() => {
      this.performRandomJump();
    }, 1000 + Math.random() * 2000); // Прыгаем каждые 1-3 секунды
  }

  performRandomJump() {
    if (!this.isConnected) return;

    // Начинаем зарядку прыжка
    this.currentInput.space = true;
    this.sendInput();

    // Держим пробел случайное время (0.1 - 1 секунда)
    const chargeTime = 100 + Math.random() * 900;

    setTimeout(() => {
      // Отпускаем пробел
      this.currentInput.space = false;
      this.sendInput();
    }, chargeTime);
  }

  sendInput() {
    if (this.socket && this.isConnected) {
      this.socket.emit('input', this.currentInput);
    }
  }

  stopBehavior() {
    if (this.moveInterval) {
      clearInterval(this.moveInterval);
      this.moveInterval = null;
    }
    if (this.jumpInterval) {
      clearInterval(this.jumpInterval);
      this.jumpInterval = null;
    }
  }

  disconnect() {
    this.stopBehavior();
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
  }
}

// Управление ботами
class BotManager {
  constructor(botCount) {
    this.botCount = botCount;
    this.bots = [];
    this.stats = {
      connected: 0,
      disconnected: 0,
      startTime: null
    };
  }

  start() {
    console.log(`\n🤖 Starting ${this.botCount} bots...\n`);
    this.stats.startTime = Date.now();

    // Запускаем ботов с небольшой задержкой между каждым
    for (let i = 0; i < this.botCount; i++) {
      setTimeout(() => {
        const bot = new Bot(i + 1);
        this.bots.push(bot);
        bot.connect();
      }, i * 100); // 100мс задержка между подключениями
    }

    // Статистика каждые 10 секунд
    setInterval(() => {
      this.printStats();
    }, 10000);

    // Обработка завершения
    process.on('SIGINT', () => {
      console.log('\n\n🛑 Stopping all bots...\n');
      this.stopAll();
      setTimeout(() => {
        process.exit(0);
      }, 1000);
    });
  }

  printStats() {
    const connected = this.bots.filter(b => b.isConnected).length;
    const uptime = Math.floor((Date.now() - this.stats.startTime) / 1000);
    
    console.log(`\n📊 Stats (uptime: ${uptime}s):`);
    console.log(`   Connected: ${connected}/${this.botCount}`);
    console.log(`   Disconnected: ${this.botCount - connected}`);
    console.log(`   Memory: ${Math.round(process.memoryUsage().heapUsed / 1024 / 1024)} MB`);
  }

  stopAll() {
    this.bots.forEach(bot => bot.disconnect());
    this.bots = [];
  }
}

// Запуск
console.log(`
╔════════════════════════════════════════╗
║   Jump King Load Testing Tool 🚀      ║
║   Server: ${SERVER_URL.substring(0, 30)}...
║   Bots: ${BOT_COUNT}                           ║
╚════════════════════════════════════════╝
`);

const manager = new BotManager(BOT_COUNT);
manager.start();

console.log(`\n✅ Bots are starting... Press Ctrl+C to stop.\n`);