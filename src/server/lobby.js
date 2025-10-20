const Game = require('./game');

class Lobby {
  constructor(id) {
    this.id = id;
    this.game = new Game();
    this.players = new Map();
    this.maxPlayers = 10;
    this.createdAt = Date.now();
  }

  isFull() {
    return this.players.size >= this.maxPlayers;
  }

  isEmpty() {
    return this.players.size === 0;
  }

  canJoin() {
    return !this.isFull();
  }

  addPlayer(socket, username) {
    if (this.isFull()) {
      return false;
    }

    const player = this.game.addPlayer(socket, username);
    if (player) {
      this.players.set(socket.id, {
        socket: socket,
        username: username,
        joinedAt: Date.now()
      });
      return true;
    }
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
  constructor() {
    this.lobbies = new Map();
    this.playerToLobby = new Map();
    this.nextLobbyId = 1;
    
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

  createLobby() {
    const lobbyId = `lobby_${this.nextLobbyId++}`;
    const lobby = new Lobby(lobbyId);
    this.lobbies.set(lobbyId, lobby);
    console.log(`[LobbyManager] Created ${lobbyId}`);
    return lobby;
  }

  findAvailableLobby() {
    for (const [id, lobby] of this.lobbies) {
      if (lobby.canJoin()) {
        return lobby;
      }
    }
    return this.createLobby();
  }

  addPlayer(socket, username) {
    if (this.playerToLobby.has(socket.id)) {
      console.log(`[LobbyManager] Player ${socket.id} already in a lobby`);
      return false;
    }

    const lobby = this.findAvailableLobby();
    const success = lobby.addPlayer(socket, username);
    
    if (success) {
      this.playerToLobby.set(socket.id, lobby.id);
      
      socket.emit('lobby_joined', {
        lobbyId: lobby.id,
        players: lobby.getPlayerCount(),
        maxPlayers: lobby.maxPlayers
      });
      
      this.broadcastToLobby(lobby.id, 'lobby_update', lobby.getInfo());
      
      console.log(`[LobbyManager] Player ${username} joined ${lobby.id} (${lobby.getPlayerCount()}/${lobby.maxPlayers})`);
      return true;
    }
    
    return false;
  }

  removePlayer(socket) {
    const lobbyId = this.playerToLobby.get(socket.id);
    
    if (!lobbyId) {
      return;
    }

    const lobby = this.lobbies.get(lobbyId);
    
    if (lobby) {
      lobby.removePlayer(socket);
      console.log(`[LobbyManager] Player removed from ${lobbyId} (${lobby.getPlayerCount()}/${lobby.maxPlayers})`);
      
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
    const totalPlayers = Array.from(this.lobbies.values())
      .reduce((sum, lobby) => sum + lobby.getPlayerCount(), 0);
    
    const workerId = process.env.WORKER_ID || 'single';
    console.log(`[Worker #${workerId}] Lobbies: ${this.lobbies.size}, Total players: ${totalPlayers}`);
    
    // Детальная информация по каждому лобби
    for (const [id, lobby] of this.lobbies) {
      console.log(`  ${id}: ${lobby.getPlayerCount()}/${lobby.maxPlayers} players`);
    }
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
      players: this.getTotalPlayers()
    };
  }
}

module.exports = { Lobby, LobbyManager };