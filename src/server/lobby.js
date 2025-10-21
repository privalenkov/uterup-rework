const Game = require('./game');
const Constants = require('../shared/constants');

class Lobby {
  constructor(id, map = null) {
    this.id = id;
    this.game = new Game(map); // Передаем карту в игру
    this.players = new Map();
    this.maxPlayers = 10;
    this.createdAt = Date.now();
    
    // Счетчик зарезервированных слотов
    this.reservedSlots = 0;
  }

  setMap(map) {
    // Вежливо отключим игроков, чтобы они переподключились к новой карте
    for (const [socket] of this.players) {
      try { socket.emit('map_updated'); } catch {}
      setTimeout(() => { try { socket.disconnect(true); } catch {} }, 50);
    }
    this.players.clear();
    this.reservedSlots = 0;
    this.game = new Game(map); // Новый инстанс игры с новой картой
  }

  isFull() {
    return (this.players.size + this.reservedSlots) >= this.maxPlayers;
  }

  isEmpty() {
    return this.players.size === 0 && this.reservedSlots === 0;
  }

  canJoin() {
    return !this.isFull();
  }

  reserveSlot() {
    if (this.isFull()) {
      return false;
    }
    this.reservedSlots++;
    return true;
  }

  releaseSlot() {
    if (this.reservedSlots > 0) {
      this.reservedSlots--;
    }
  }

  addPlayer(socket, username) {
    const player = this.game.addPlayer(socket, username);
    if (player) {
      this.players.set(socket.id, {
        socket: socket,
        username: username,
        joinedAt: Date.now()
      });
      this.releaseSlot();
      return true;
    }
    this.releaseSlot();
    return false;
  }

  removePlayer(socket) {
    this.players.delete(socket.id);
    this.game.removePlayer(socket);
  }

  handleInput(socket, input) {
    this.game.handleInput(socket, input);
  }

  getPlayerCount() {
    return this.players.size;
  }

  getInfo() {
    return {
      id: this.id,
      players: this.players.size,
      maxPlayers: this.maxPlayers,
      isFull: this.isFull(),
      createdAt: this.createdAt
    };
  }
}

class LobbyManager {
  constructor(dailyMap = null) {
    this.lobbies = new Map();
    this.playerToLobby = new Map();
    this.nextLobbyId = 1;
    this.dailyMap = dailyMap; // Карта дня
    
    // Глобальный лимит на весь сервер
    this.maxTotalPlayers = Constants.PLAYER_MAX_COUNT; // 70 игроков
    
    // Счетчик зарезервированных слотов на уровне сервера
    this.reservedSlots = 0;
    
    // Создаем первое лобби
    this.createLobby();
    
    // Чистим пустые лобби каждые 30 секунд
    setInterval(() => {
      this.cleanEmptyLobbies();
    }, 30000);

    // Логируем статистику каждые 10 секунд
    setInterval(() => {
      this.logStats();
    }, 10000);
  }

  setDailyMap(map) {
    this.dailyMap = map;
    for (const [, lobby] of this.lobbies) {
      lobby.setMap(map);
    }
    console.log('[LobbyManager] 🔁 Daily map applied to all lobbies');
  }

  createLobby() {
    const lobbyId = `lobby_${this.nextLobbyId++}`;
    const lobby = new Lobby(lobbyId, this.dailyMap); // Передаем карту дня
    this.lobbies.set(lobbyId, lobby);
    console.log(`[LobbyManager] Created ${lobbyId} with map:`, this.dailyMap ? 'YES' : 'NO');
    return lobby;
  }

  findAvailableLobby() {
    for (const [id, lobby] of this.lobbies) {
      if (lobby.canJoin()) {
        return lobby;
      }
    }
    
    // Проверяем глобальный лимит перед созданием нового лобби
    const currentTotal = this.getTotalPlayers() + this.reservedSlots;
    if (currentTotal >= this.maxTotalPlayers) {
      console.log(`[LobbyManager] Cannot create new lobby - server at capacity (${currentTotal}/${this.maxTotalPlayers})`);
      return null;
    }
    
    return this.createLobby();
  }

  addPlayer(socket, username) {
    // ПРОВЕРКА #1: Игрок уже подключен?
    if (this.playerToLobby.has(socket.id)) {
      console.log(`[LobbyManager] Player ${socket.id} already in a lobby`);
      return false;
    }

    // ПРОВЕРКА #2: РЕЗЕРВИРУЕМ СЛОТ (АТОМАРНАЯ ОПЕРАЦИЯ)
    const currentTotal = this.getTotalPlayers() + this.reservedSlots;
    
    if (currentTotal >= this.maxTotalPlayers) {
      console.log(`[LobbyManager] ❌ Server FULL! Rejecting ${username} (${currentTotal}/${this.maxTotalPlayers})`);
      
      socket.emit('server_full', {
        message: 'Server is full',
        currentPlayers: this.getTotalPlayers(),
        maxPlayers: this.maxTotalPlayers
      });
      
      setTimeout(() => {
        socket.disconnect(true);
      }, 100);
      
      return false;
    }

    // РЕЗЕРВИРУЕМ СЛОТ НА УРОВНЕ СЕРВЕРА
    this.reservedSlots++;
    
    console.log(`[LobbyManager] 🔒 Reserved slot for ${username} (${currentTotal + 1}/${this.maxTotalPlayers}, reserved: ${this.reservedSlots})`);

    // Ищем доступное лобби
    const lobby = this.findAvailableLobby();
    
    if (!lobby) {
      console.log(`[LobbyManager] ❌ No available lobby for ${username}`);
      
      // ОСВОБОЖДАЕМ ЗАРЕЗЕРВИРОВАННЫЙ СЛОТ
      this.reservedSlots--;
      
      socket.emit('server_full', {
        message: 'All lobbies are full',
        currentPlayers: this.getTotalPlayers(),
        maxPlayers: this.maxTotalPlayers
      });
      
      setTimeout(() => {
        socket.disconnect(true);
      }, 100);
      
      return false;
    }

    // РЕЗЕРВИРУЕМ СЛОТ В ЛОББИ
    if (!lobby.reserveSlot()) {
      console.log(`[LobbyManager] ❌ Failed to reserve slot in ${lobby.id} for ${username}`);
      
      // ОСВОБОЖДАЕМ ЗАРЕЗЕРВИРОВАННЫЙ СЛОТ НА УРОВНЕ СЕРВЕРА
      this.reservedSlots--;
      
      socket.emit('lobby_full', {
        message: 'Lobby just became full',
        lobbyId: lobby.id
      });
      
      setTimeout(() => {
        socket.disconnect(true);
      }, 100);
      
      return false;
    }
    
    // Пробуем добавить в лобби (слот уже зарезервирован)
    const success = lobby.addPlayer(socket, username);
    
    if (success) {
      // ОСВОБОЖДАЕМ ГЛОБАЛЬНЫЙ ЗАРЕЗЕРВИРОВАННЫЙ СЛОТ (теперь игрок реально добавлен)
      this.reservedSlots--;
      
      // Добавляем в Map
      this.playerToLobby.set(socket.id, lobby.id);
      
      const newTotal = this.getTotalPlayers();
      
      socket.emit('lobby_joined', {
        lobbyId: lobby.id,
        players: lobby.getPlayerCount(),
        maxPlayers: lobby.maxPlayers
      });
      
      this.broadcastToLobby(lobby.id, 'lobby_update', lobby.getInfo());
      
      console.log(`[LobbyManager] ✅ ${username} joined ${lobby.id} (${lobby.getPlayerCount()}/${lobby.maxPlayers}). Total: ${newTotal}/${this.maxTotalPlayers}`);
      return true;
    } else {
      console.log(`[LobbyManager] ❌ Failed to add ${username} to ${lobby.id}`);
      
      // ОСВОБОЖДАЕМ ОБА ЗАРЕЗЕРВИРОВАННЫХ СЛОТА (на сервере и в лобби)
      this.reservedSlots--;
      
      return false;
    }
  }

  removePlayer(socket) {
    const lobbyId = this.playerToLobby.get(socket.id);
    
    if (!lobbyId) {
      return;
    }

    const lobby = this.lobbies.get(lobbyId);
    
    if (lobby) {
      lobby.removePlayer(socket);
      const newTotal = this.getTotalPlayers();
      console.log(`[LobbyManager] Player removed from ${lobbyId} (${lobby.getPlayerCount()}/${lobby.maxPlayers}). Total: ${newTotal}/${this.maxTotalPlayers}`);
      
      this.broadcastToLobby(lobbyId, 'lobby_update', lobby.getInfo());
    }
    
    this.playerToLobby.delete(socket.id);
  }

  handleInput(socket, input) {
    const lobbyId = this.playerToLobby.get(socket.id);
    
    if (!lobbyId) {
      return;
    }

    const lobby = this.lobbies.get(lobbyId);
    
    if (lobby) {
      lobby.handleInput(socket, input);
    }
  }

  broadcastToLobby(lobbyId, event, data) {
    const lobby = this.lobbies.get(lobbyId);
    
    if (!lobby) {
      return;
    }

    for (const [socketId, playerInfo] of lobby.players) {
      playerInfo.socket.emit(event, data);
    }
  }

  cleanEmptyLobbies() {
    const emptyLobbies = [];
    
    for (const [id, lobby] of this.lobbies) {
      if (lobby.isEmpty() && this.lobbies.size > 1) {
        emptyLobbies.push(id);
      }
    }
    
    emptyLobbies.forEach(id => {
      this.lobbies.delete(id);
      console.log(`[LobbyManager] Removed empty ${id}`);
    });
    
    if (this.lobbies.size === 0) {
      this.createLobby();
    }
  }

  logStats() {
    const totalPlayers = this.getTotalPlayers();
    const totalWithReserved = totalPlayers + this.reservedSlots;
    const workerId = process.env.WORKER_ID || 'single';
    
    console.log(`\n${'='.repeat(60)}`);
    console.log(`[Worker #${workerId}] 📊 Server Statistics:`);
    console.log(`   Total players: ${totalPlayers}/${this.maxTotalPlayers}`);
    console.log(`   Reserved slots: ${this.reservedSlots}`);
    console.log(`   Total (with reserved): ${totalWithReserved}/${this.maxTotalPlayers} ${totalWithReserved >= this.maxTotalPlayers ? '🔴 FULL' : '🟢 OPEN'}`);
    console.log(`   Total lobbies: ${this.lobbies.size}`);
    
    // Детальная информация по каждому лобби
    for (const [id, lobby] of this.lobbies) {
      const status = lobby.isFull() ? '🔴' : '🟢';
      const reserved = lobby.reservedSlots > 0 ? ` (reserved: ${lobby.reservedSlots})` : '';
      console.log(`   ${status} ${id}: ${lobby.getPlayerCount()}/10 players${reserved}`);
    }
    console.log(`${'='.repeat(60)}\n`);
  }

  getAllLobbies() {
    return Array.from(this.lobbies.values()).map(lobby => lobby.getInfo());
  }

  getTotalPlayers() {
    return this.playerToLobby.size;
  }

  // Метод для получения статистики (для cluster)
  getStats() {
    return {
      lobbies: this.lobbies.size,
      players: this.getTotalPlayers(),
      maxPlayers: this.maxTotalPlayers,
      reservedSlots: this.reservedSlots
    };
  }
}

module.exports = { Lobby, LobbyManager };