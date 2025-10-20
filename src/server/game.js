const Constants = require('../shared/constants');
const Player = require('./player');
const { generateMap } = require('./map');

class Game {
  constructor() {
    this.sockets = {};
    this.players = {};
    this.inputs = {};
    this.lastUpdateTime = Date.now();
    this.map = generateMap();
    
    // Кэш для nearby players (обновляется реже)
    this.nearbyPlayersCache = {};
    this.cacheUpdateCounter = 0;
    
    setInterval(this.update.bind(this), 1000 / Constants.SERVER_UPDATE_RATE);
  }

  addPlayer(socket, username) {
    if (Object.keys(this.players).length >= Constants.PLAYER_MAX_COUNT) {
      return null;
    }

    this.sockets[socket.id] = socket;
    this.inputs[socket.id] = { left: false, right: false, space: false };

    const startX = 5 * Constants.TILE_SIZE;
    const startY = (Constants.MAP_HEIGHT - 3) * Constants.TILE_SIZE - Constants.PLAYER_HEIGHT;
    
    this.players[socket.id] = new Player(socket.id, username, startX, startY);
    return this.players[socket.id];
  }

  removePlayer(socket) {
    delete this.sockets[socket.id];
    delete this.players[socket.id];
    delete this.inputs[socket.id];
    delete this.nearbyPlayersCache[socket.id];
  }

  handleInput(socket, input) {
    if (this.players[socket.id]) {
      this.inputs[socket.id] = input;
    }
  }

  update() {
    const now = Date.now();
    const dt = (now - this.lastUpdateTime) / 1000;
    this.lastUpdateTime = now;

    // Обновляем всех игроков (НЕ пропускаем никого!)
    const playerIds = Object.keys(this.players);
    for (let i = 0; i < playerIds.length; i++) {
      const playerId = playerIds[i];
      const player = this.players[playerId];
      const input = this.inputs[playerId];
      player.update(dt, input, this.map);
    }

    // ОПТИМИЗАЦИЯ 1: Обновляем nearby игроков только каждые 2 кадра
    // (игрок не заметит задержки в 66мс для позиций других игроков)
    this.cacheUpdateCounter++;
    if (this.cacheUpdateCounter >= 2) {
      this.updateNearbyPlayersCache();
      this.cacheUpdateCounter = 0;
    }

    // Отправляем обновления всем игрокам
    for (let i = 0; i < playerIds.length; i++) {
      const playerId = playerIds[i];
      const socket = this.sockets[playerId];
      const player = this.players[playerId];
      
      if (player && socket) {
        // ОПТИМИЗАЦИЯ 2: используем volatile для некритичных обновлений
        // (пропускает пакеты если клиент не успевает)
        socket.volatile.emit(Constants.MSG_TYPES.GAME_UPDATE, this.createUpdate(player, playerId));
      }
    }
  }

  updateNearbyPlayersCache() {
    const playerIds = Object.keys(this.players);
    
    for (let i = 0; i < playerIds.length; i++) {
      const playerId = playerIds[i];
      const player = this.players[playerId];
      
      const nearby = [];
      for (let j = 0; j < playerIds.length; j++) {
        if (i === j) continue;
        
        const otherPlayer = this.players[playerIds[j]];
        const verticalDist = Math.abs(otherPlayer.y - player.y);
        const horizontalDist = Math.abs(otherPlayer.x - player.x);
        
        // Видимость в пределах экрана + запас
        if (verticalDist < 800 && horizontalDist < 640) {
          nearby.push(otherPlayer.serializeForUpdate());
        }
      }
      
      this.nearbyPlayersCache[playerId] = nearby;
    }
  }

  createUpdate(player, playerId) {
    // Используем кэш nearby игроков
    const nearbyPlayers = this.nearbyPlayersCache[playerId] || [];

    const update = {
      t: Date.now(),
      me: player.serializeForUpdate(),
      others: nearbyPlayers,
      leaderboard: this.getLeaderboard()
    };

    // Карту отправляем только один раз
    if (!player.mapSent) {
      update.map = this.map;
      player.mapSent = true;
    }

    return update;
  }

  getLeaderboard() {
    return Object.values(this.players)
      .filter(p => p.finishTime !== null)
      .sort((a, b) => a.averageJumps - b.averageJumps)
      .slice(0, 10)
      .map(p => ({
        username: p.username,
        jumps: p.averageJumps
      }));
  }
}

module.exports = Game;