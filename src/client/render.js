import { getCurrentState } from './state';
const Constants = require('../shared/constants');

const canvas = document.getElementById('game-canvas');
const context = canvas.getContext('2d');

canvas.width = window.innerWidth;
canvas.height = window.innerHeight;

function render() {
  const { me, others, map } = getCurrentState();
  if (!me) {
    return;
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

  // Рендерим индикатор зарядки прыжка
  if (me.isCharging) {
    renderJumpCharge(me);
  }

  context.restore();

  // UI элементы
  renderUI(me);
}

function renderMap(map) {
  if (!map) return;

  const tileColors = {
    [Constants.TILE_TYPES.EMPTY]: null,
    [Constants.TILE_TYPES.SOLID]: '#8B4513',
    [Constants.TILE_TYPES.ICE]: '#87CEEB',
    [Constants.TILE_TYPES.SNOW]: '#FFFAFA',
    [Constants.TILE_TYPES.SLOPE]: '#FF6347',
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
      }
    }
  }
}

function renderPlayer(player, isMe = false) {
  context.save();
  
  // Цвет игрока
  context.fillStyle = isMe ? '#00FF00' : '#0080FF';
  
  // Если заряжаем прыжок - приседаем (визуальный эффект)
  let yOffset = 0;
  if (player.isCharging) {
    yOffset = 8; // Приседание
  }
  
  context.fillRect(
    player.x,
    player.y + yOffset,
    Constants.PLAYER_WIDTH,
    Constants.PLAYER_HEIGHT - yOffset
  );

  // Индикатор направления прыжка
  if (player.isCharging && isMe) {
    context.strokeStyle = '#FFFF00';
    context.lineWidth = 2;
    context.beginPath();
    
    const centerX = player.x + Constants.PLAYER_WIDTH / 2;
    const centerY = player.y + Constants.PLAYER_HEIGHT / 2;
    
    // Стрелка направления
    let arrowX = centerX;
    let arrowY = centerY - 30;
    
    if (player.jumpDirection === -1) {
      arrowX = centerX - 20;
      arrowY = centerY - 25;
    } else if (player.jumpDirection === 1) {
      arrowX = centerX + 20;
      arrowY = centerY - 25;
    }
    
    context.moveTo(centerX, centerY);
    context.lineTo(arrowX, arrowY);
    context.stroke();
    
    // Стрелка
    context.beginPath();
    context.arc(arrowX, arrowY, 3, 0, Math.PI * 2);
    context.fill();
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

function renderJumpCharge(player) {
  const barWidth = 60;
  const barHeight = 8;
  const chargePercent = (player.jumpCharge - Constants.JUMP_MIN_POWER) / 
                        (Constants.JUMP_MAX_POWER - Constants.JUMP_MIN_POWER);

  const barX = player.x + Constants.PLAYER_WIDTH / 2 - barWidth / 2;
  const barY = player.y - 25;

  // Фон полоски
  context.fillStyle = 'rgba(0, 0, 0, 0.7)';
  context.fillRect(barX, barY, barWidth, barHeight);

  // Заполненная часть
  const gradient = context.createLinearGradient(barX, 0, barX + barWidth, 0);
  gradient.addColorStop(0, '#00FF00');
  gradient.addColorStop(0.5, '#FFFF00');
  gradient.addColorStop(1, '#FF0000');
  
  context.fillStyle = gradient;
  context.fillRect(barX, barY, barWidth * chargePercent, barHeight);
  
  // Обводка
  context.strokeStyle = '#FFFFFF';
  context.lineWidth = 2;
  context.strokeRect(barX, barY, barWidth, barHeight);
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

  // Статус
  const statusY = 75;
  context.font = 'bold 16px Arial';
  
  context.fillStyle = player.isOnGround ? '#00FF00' : '#FF4444';
  context.strokeText(`${player.isOnGround ? '✓' : '✗'} On Ground`, 20, statusY);
  context.fillText(`${player.isOnGround ? '✓' : '✗'} On Ground`, 20, statusY);
  
  if (player.isCharging) {
    context.fillStyle = '#FFFF00';
    const chargePercent = Math.round((player.jumpCharge / Constants.JUMP_MAX_POWER) * 100);
    context.strokeText(`⚡ Charging: ${chargePercent}%`, 20, statusY + 30);
    context.fillText(`⚡ Charging: ${chargePercent}%`, 20, statusY + 30);
  }

  // Скорость (для отладки - можно убрать потом)
  if (Math.abs(player.velocityY) > 0.1 || Math.abs(player.velocityX) > 0.1) {
    context.font = '14px Arial';
    context.fillStyle = '#AAAAAA';
    context.strokeText(`V: ↕${player.velocityY?.toFixed(1) || 0} ↔${player.velocityX?.toFixed(1) || 0}`, 20, statusY + 60);
    context.fillText(`V: ↕${player.velocityY?.toFixed(1) || 0} ↔${player.velocityX?.toFixed(1) || 0}`, 20, statusY + 60);
  }

  // Инструкция
  context.fillStyle = '#FFFFFF';
  context.font = 'bold 14px Arial';
  const instructions = 'WALK: ⬅️➡️ | JUMP: HOLD SPACE ⬆️ charge → SET DIRECTION ⬅️➡️ → RELEASE';
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