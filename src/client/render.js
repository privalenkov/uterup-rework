import { getCurrentState } from './state';
const Constants = require('../shared/constants');

const canvas = document.getElementById('game-canvas');
const context = canvas.getContext('2d');

canvas.width = window.innerWidth;
canvas.height = window.innerHeight;

let mapLogged = false;

function render() {
  const { me, others, map } = getCurrentState();
  if (!me) {
    return;
  }

  // Отладка: выводим информацию о карте один раз
  if (!mapLogged && map) {
    console.log('Rendering with map:', {
      height: map.length,
      width: map[0] ? map[0].length : 0,
      playerY: me.y,
      playerX: me.x
    });
    mapLogged = true;
  }

  // Очищаем canvas
  context.clearRect(0, 0, canvas.width, canvas.height);

  // Камера следует за игроком
  const cameraX = canvas.width / 2 - me.x;
  const cameraY = canvas.height / 2 - me.y;

  context.save();
  context.translate(cameraX, cameraY);

  // Рендерим карту
  renderMap(map);

  // Рендерим других игроков
  others.forEach(renderPlayer);

  // Рендерим текущего игрока
  renderPlayer(me, true);

  context.restore();

  // UI элементы
  renderUI(me);
}

function renderMap(map) {
  if (!map) {
    console.warn('renderMap called with no map');
    return;
  }

  const tileColors = {
    [Constants.TILE_TYPES.EMPTY]: null,
    [Constants.TILE_TYPES.SOLID]: '#8B4513',
    [Constants.TILE_TYPES.ICE]: '#87CEEB',
    [Constants.TILE_TYPES.SNOW]: '#FFFAFA',
    [Constants.TILE_TYPES.SLOPE_LEFT]: '#FF6347',
    [Constants.TILE_TYPES.SLOPE_RIGHT]: '#FF8C00',
    [Constants.TILE_TYPES.FINISH]: '#FFD700'
  };

  for (let y = 0; y < map.length; y++) {
    for (let x = 0; x < map[y].length; x++) {
      const tileType = map[y][x];
      const color = tileColors[tileType];
      
      if (color) {
        context.fillStyle = color;
        context.fillRect(
          x * Constants.TILE_SIZE,
          y * Constants.TILE_SIZE,
          Constants.TILE_SIZE,
          Constants.TILE_SIZE
        );
        
        // Обводка тайла
        context.strokeStyle = '#000';
        context.lineWidth = 1;
        context.strokeRect(
          x * Constants.TILE_SIZE,
          y * Constants.TILE_SIZE,
          Constants.TILE_SIZE,
          Constants.TILE_SIZE
        );

        if (tileType === Constants.TILE_TYPES.SLOPE_LEFT) {
          context.fillStyle = '#FFF';
          context.font = 'bold 20px Arial';
          context.textAlign = 'center';
          context.textBaseline = 'middle';
          context.fillText('◣', 
            x * Constants.TILE_SIZE + Constants.TILE_SIZE / 2,
            y * Constants.TILE_SIZE + Constants.TILE_SIZE / 2
          );
        } else if (tileType === Constants.TILE_TYPES.SLOPE_RIGHT) {
          context.fillStyle = '#FFF';
          context.font = 'bold 20px Arial';
          context.textAlign = 'center';
          context.textBaseline = 'middle';
          context.fillText('◢', 
            x * Constants.TILE_SIZE + Constants.TILE_SIZE / 2,
            y * Constants.TILE_SIZE + Constants.TILE_SIZE / 2
          );
        }
      }
    }
  }
}

function renderPlayer(player, isMe = false) {
  context.save();
  
  // Цвет игрока
  context.fillStyle = isMe ? '#00FF00' : '#0080FF';
  
  // Приседание при зарядке
  let yOffset = 0;
  if (player.isCharging) {
    yOffset = 8;
  }
  
  // Рисуем игрока
  context.fillRect(
    player.x,
    player.y + yOffset,
    Constants.PLAYER_WIDTH,
    Constants.PLAYER_HEIGHT - yOffset
  );

  if (player.isStunned) {
    context.fillStyle = '#FFFF00';
    context.font = 'bold 20px Arial';
    context.textAlign = 'center';
    context.strokeStyle = '#000000';
    context.lineWidth = 3;
    
    const stunText = '💫';
    context.strokeText(stunText, player.x + Constants.PLAYER_WIDTH / 2, player.y - 10);
    context.fillText(stunText, player.x + Constants.PLAYER_WIDTH / 2, player.y - 10);
  }

  // Имя игрока
  context.fillStyle = '#FFFFFF';
  context.font = 'bold 12px Arial';
  context.textAlign = 'center';
  context.strokeStyle = '#000000';
  context.lineWidth = 3;
  context.strokeText(
    player.username,
    player.x + Constants.PLAYER_WIDTH / 2,
    player.y - 5
  );
  context.fillText(
    player.username,
    player.x + Constants.PLAYER_WIDTH / 2,
    player.y - 5
  );
  
  context.restore();
}

function renderUI(player) {
  // Счетчик прыжков
  context.fillStyle = '#FFFFFF';
  context.font = 'bold 24px Arial';
  context.textAlign = 'left';
  context.strokeStyle = '#000000';
  context.lineWidth = 4;
  
  context.strokeText(`Jumps: ${player.jumpCount}`, 20, 40);
  context.fillText(`Jumps: ${player.jumpCount}`, 20, 40);

  // Инструкция
  context.fillStyle = '#FFFFFF';
  context.font = 'bold 14px Arial';
  const instructions = 'MOVE: ⬅️➡️ | JUMP: HOLD SPACE → SET DIRECTION → RELEASE';
  context.strokeText(instructions, 20, canvas.height - 20);
  context.fillText(instructions, 20, canvas.height - 20);
}

let renderInterval = null;

export function startRendering() {
  renderInterval = setInterval(render, 1000 / 60);
}

export function stopRendering() {
  clearInterval(renderInterval);
}