module.exports = Object.freeze({
  MSG_TYPES: {
    JOIN_GAME: 'join_game',
    GAME_UPDATE: 'update',
    INPUT: 'input',
    PLAYER_FINISH: 'player_finish'
  },

  PLAYER_WIDTH: 32,
  PLAYER_HEIGHT: 48,
  PLAYER_WALK_SPEED: 5,
  
  JUMP_CHARGE_RATE: 1.0,
  JUMP_MIN_POWER: 10,
  JUMP_MAX_POWER: 38,
  JUMP_COOLDOWN: 0.3,
  
  GRAVITY: 2,

  STUN_DURATION: 1.0, // Длительность оглушения в секундах
  STUN_FALL_THRESHOLD: 15, // Минимальная высота падения для оглушения (в тайлах)

  WALL_BOUNCE_THRESHOLD: 3, // Минимальная скорость для рикошета
  WALL_BOUNCE_FACTOR: 0.5, 
  
  TILE_SIZE: 32,
  TILE_TYPES: {
    EMPTY: 0,
    SOLID: 1,
    ICE: 2,
    SNOW: 3,
    SLOPE: 4,
    FINISH: 5
  },

  MAP_WIDTH: 20,
  MAP_HEIGHT: 100,
  
  PLAYER_MAX_COUNT: 300,
  SERVER_UPDATE_RATE: 30, // Оставляем 20 для плавности
  
  ICE_SLIDE_SPEED: 8,
  SLOPE_SLIDE_SPEED: 14,
});