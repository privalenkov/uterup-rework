const Constants = require('../shared/constants');

class MapGenerator {
  constructor(seed) {
    this.width = Constants.MAP_WIDTH;
    this.height = Constants.MAP_HEIGHT;
    this.map = [];
    this.seed = seed || Date.now();
    this.rng = this.seededRandom(this.seed);
    
    // Инициализируем пустую карту
    for (let y = 0; y < this.height; y++) {
      this.map[y] = [];
      for (let x = 0; x < this.width; x++) {
        this.map[y][x] = Constants.TILE_TYPES.EMPTY;
      }
    }
    
    // Гарантированный путь
    this.guaranteedPath = [];
  }

  seededRandom(seed) {
    let value = seed;
    return () => {
      value = (value * 9301 + 49297) % 233280;
      return value / 233280;
    };
  }

  random(min, max) {
    return Math.floor(this.rng() * (max - min + 1)) + min;
  }

  // Используем РЕАЛЬНУЮ физику из player.js для расчета прыжка
  calculateJump(jumpPower, jumpDirection) {
    // Из player.js:
    const chargeRatio = (jumpPower - Constants.JUMP_MIN_POWER) / 
                        (Constants.JUMP_MAX_POWER - Constants.JUMP_MIN_POWER);
    
    let angle;
    
    if (jumpDirection === 0) {
      // Прямо вверх - 90 градусов
      angle = Math.PI / 2;
    } else {
      // Диагональный прыжок - угол от 45° до 72°
      const minAngle = 45;
      const maxAngle = 72;
      const angleDegrees = minAngle + (maxAngle - minAngle) * chargeRatio;
      angle = (angleDegrees * Math.PI) / 180;
    }
    
    // Разложение скорости (из player.js)
    const velocityY = -jumpPower * Math.sin(angle);
    const horizontalComponent = jumpPower * Math.cos(angle);
    const velocityX = horizontalComponent * jumpDirection;
    
    // Рассчитываем дальность с учетом гравитации
    const gravity = Constants.GRAVITY;
    
    // Максимальная высота: h = velocityY^2 / (2 * gravity)
    const maxHeight = (velocityY * velocityY) / (2 * gravity);
    
    // Время полета: t = 2 * velocityY / gravity
    const timeInAir = (2 * Math.abs(velocityY)) / gravity;
    
    // Горизонтальная дальность: d = velocityX * time
    const horizontalDistance = Math.abs(velocityX) * timeInAir;
    
    return {
      height: maxHeight / Constants.TILE_SIZE,
      distance: horizontalDistance / Constants.TILE_SIZE,
      direction: jumpDirection
    };
  }

  // Основная функция генерации
  generate() {
    console.log('🗺️  Map Generation Started');
    console.log('═══════════════════════════════════════\n');
    
    // Рассчитываем возможности прыжков
    console.log('📊 Jump Physics (from player.js):');
    
    const minJump = this.calculateJump(Constants.JUMP_MIN_POWER, 1);
    const midJump = this.calculateJump(24, 1);
    const maxJump = this.calculateJump(Constants.JUMP_MAX_POWER, 1);
    const maxJumpUp = this.calculateJump(Constants.JUMP_MAX_POWER, 0);
    
    console.log(`   Min (power=${Constants.JUMP_MIN_POWER}): ↑${minJump.height.toFixed(1)} →${minJump.distance.toFixed(1)} tiles`);
    console.log(`   Mid (power=24): ↑${midJump.height.toFixed(1)} →${midJump.distance.toFixed(1)} tiles`);
    console.log(`   Max (power=${Constants.JUMP_MAX_POWER}): ↑${maxJump.height.toFixed(1)} →${maxJump.distance.toFixed(1)} tiles`);
    console.log(`   Max UP (power=${Constants.JUMP_MAX_POWER}): ↑${maxJumpUp.height.toFixed(1)} tiles\n`);
    
    // 1. Границы
    this.createBorders();
    
    // 2. Генерируем путь снизу вверх
    this.generatePath();
    
    // 3. Размещаем платформы
    this.placePlatforms();
    
    // 4. Финиш
    this.createFinish();
    
    // 5. Препятствия
    this.addObstacles();
    
    console.log('═══════════════════════════════════════');
    console.log('✅ Map Generation Complete\n');
    
    return this.map;
  }

  createBorders() {
    for (let y = 0; y < this.height; y++) {
      this.map[y][0] = Constants.TILE_TYPES.SOLID;
      this.map[y][this.width - 1] = Constants.TILE_TYPES.SOLID;
    }
    
    for (let x = 0; x < this.width; x++) {
      this.map[this.height - 1][x] = Constants.TILE_TYPES.SOLID;
    }
  }

  // Генерация пути с использованием реальной физики
  generatePath() {
    console.log('🛤️  Generating Path:\n');
    
    // Стартовая платформа
    const startY = this.height - 3;
    const startX = Math.floor(this.width / 2);
    
    this.guaranteedPath.push({
      x: startX,
      y: startY,
      width: 10,
      type: 'start'
    });
    
    let currentX = startX;
    let currentY = startY;
    let stepCount = 0;
    
    // Генерируем путь снизу вверх
    while (currentY > 15) {
      stepCount++;
      
      // Выбираем случайную силу прыжка (15-32 для безопасности)
      const jumpPower = this.random(15, 32);
      
      // Выбираем направление: 0=вверх, -1=влево, 1=вправо
      const rand = this.rng();
      let jumpDirection;
      if (rand < 0.35) {
        jumpDirection = -1; // Влево
      } else if (rand < 0.70) {
        jumpDirection = 1; // Вправо
      } else {
        jumpDirection = 0; // Вверх
      }
      
      // Рассчитываем РЕАЛЬНЫЙ прыжок
      const jump = this.calculateJump(jumpPower, jumpDirection);
      
      // Следующая позиция
      const nextY = Math.floor(currentY - jump.height * 0.8); // 80% от высоты для безопасности
      const nextXOffset = Math.floor(jump.distance * 0.7 * jumpDirection); // 70% от дальности
      let nextX = currentX + nextXOffset;
      
      // Ограничиваем границами
      nextX = Math.max(6, Math.min(nextX, this.width - 8));
      
      // Размер платформы
      const platformWidth = this.random(5, 8);
      
      this.guaranteedPath.push({
        x: nextX,
        y: nextY,
        width: platformWidth,
        type: 'platform',
        jumpPower: jumpPower,
        jumpDirection: jumpDirection
      });
      
      const actualVertical = currentY - nextY;
      const actualHorizontal = Math.abs(nextX - currentX);
      
      console.log(`   ${stepCount}. (${currentX},${currentY}) → (${nextX},${nextY})`);
      console.log(`      Power=${jumpPower}, Dir=${jumpDirection === 0 ? 'UP' : jumpDirection === -1 ? 'LEFT' : 'RIGHT'}`);
      console.log(`      Jump: ↑${actualVertical} →${actualHorizontal} tiles, Platform width: ${platformWidth}\n`);
      
      currentX = nextX;
      currentY = nextY;
      
      if (nextY < 15) break;
    }
    
    console.log(`   Total: ${stepCount} platforms\n`);
  }

  placePlatforms() {
    console.log('🏗️  Placing Platforms:\n');
    
    for (let i = 0; i < this.guaranteedPath.length; i++) {
      const point = this.guaranteedPath[i];
      const startX = point.x - Math.floor(point.width / 2);
      const endX = startX + point.width - 1;
      
      for (let x = startX; x <= endX; x++) {
        if (x >= 1 && x < this.width - 1) {
          this.map[point.y][x] = Constants.TILE_TYPES.SOLID;
        }
      }
      
      console.log(`   ${point.type} at Y=${point.y}, X=${startX}-${endX}`);
    }
    
    console.log('');
  }

  createFinish() {
    const finishY = 5;
    const finishX = Math.floor(this.width / 2) - 3;
    
    // Финишная платформа
    for (let x = finishX; x <= finishX + 6; x++) {
      if (x >= 1 && x < this.width - 1) {
        this.map[finishY][x] = Constants.TILE_TYPES.FINISH;
      }
    }
    
    // Стены
    for (let y = finishY - 2; y <= finishY + 1; y++) {
      if (y >= 0 && y < this.height) {
        this.map[y][finishX - 1] = Constants.TILE_TYPES.SOLID;
        this.map[y][finishX + 7] = Constants.TILE_TYPES.SOLID;
      }
    }
    
    console.log('🏁 Finish placed at Y=5\n');
  }

  addObstacles() {
    console.log('🧊 Adding Obstacles:\n');
    
    let iceCount = 0;
    let snowCount = 0;
    
    // Проходим по всем блокам
    for (let y = this.height - 10; y > 10; y--) {
      for (let x = 2; x < this.width - 2; x++) {
        if (this.map[y][x] === Constants.TILE_TYPES.SOLID && 
            this.map[y - 1][x] === Constants.TILE_TYPES.EMPTY) {
          
          // Не трогаем стартовую платформу
          if (y === this.height - 3) continue;
          
          const zoneHeight = this.height - y;
          const probability = Math.min(0.10, 0.03 + (zoneHeight / 800));
          
          if (this.rng() < probability) {
            const type = this.rng();
            
            if (type < 0.5) {
              // Лед (ровно 3 блока)
              if (this.placeObstacle(x, y, 3, Constants.TILE_TYPES.ICE)) {
                iceCount++;
                x += 2; // Пропускаем размещенные блоки
              }
            } else {
              // Снег (ровно 3 блока)
              if (this.placeObstacle(x, y, 3, Constants.TILE_TYPES.SNOW)) {
                snowCount++;
                x += 2;
              }
            }
          }
        }
      }
    }
    
    console.log(`   Ice patches: ${iceCount}`);
    console.log(`   Snow patches: ${snowCount}\n`);
  }

  placeObstacle(startX, y, length, type) {
    // Проверяем что есть место для всех блоков
    for (let i = 0; i < length; i++) {
      const x = startX + i;
      if (x >= this.width - 1 || this.map[y][x] !== Constants.TILE_TYPES.SOLID) {
        return false;
      }
    }
    
    // Размещаем препятствие
    for (let i = 0; i < length; i++) {
      this.map[y][startX + i] = type;
    }
    
    return true;
  }
}

function generateMap(seed) {
  const generator = new MapGenerator(seed);
  const map = generator.generate();
  
  console.log(`Seed: ${generator.seed}`);
  console.log(`Path length: ${generator.guaranteedPath.length} platforms`);
  
  return map;
}

module.exports = { generateMap, MapGenerator };