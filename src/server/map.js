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

  // Основная функция генерации
  generate() {
    // 1. Границы
    this.createBorders();
    
    // 2. Стартовая платформа
    this.createStartPlatform();
    
    // 3. Генерируем ПУТЬ снизу вверх (гарантия проходимости)
    const path = this.generatePath();
    
    // 4. Размещаем платформы по пути
    this.placePlatformsAlongPath(path);
    
    // 5. Добавляем дополнительные платформы (альтернативные пути)
    this.addExtraPlatforms(path);
    
    // 6. Добавляем препятствия
    this.addObstacles();
    
    // 7. Финиш
    this.createFinish();
    
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

  createStartPlatform() {
    const startY = this.height - 3;
    for (let x = 1; x < this.width - 1; x++) {
      this.map[startY][x] = Constants.TILE_TYPES.SOLID;
    }
  }

  // Генерация ГАРАНТИРОВАННОГО пути
  generatePath() {
    const path = [];
    
    // Стартовая точка
    let currentX = Math.floor(this.width / 2);
    let currentY = this.height - 3;
    
    path.push({ x: currentX, y: currentY, width: 6 });
    
    // Параметры прыжка (консервативные для гарантии проходимости)
    const jumpParams = {
      minVertical: 3,    // Минимальный прыжок вверх
      maxVertical: 8,    // Максимальный прыжок вверх (консервативно)
      maxHorizontal: 4   // Максимальная горизонталь (консервативно)
    };
    
    // Идем снизу вверх
    while (currentY > 10) {
      // Определяем следующую платформу
      const verticalJump = this.random(jumpParams.minVertical, jumpParams.maxVertical);
      const nextY = currentY - verticalJump;
      
      if (nextY < 5) break;
      
      // Горизонтальное смещение (может быть влево или вправо)
      const direction = this.rng() < 0.5 ? -1 : 1;
      const horizontalJump = this.random(1, jumpParams.maxHorizontal);
      let nextX = currentX + (direction * horizontalJump);
      
      // Ограничиваем границами
      nextX = Math.max(3, Math.min(nextX, this.width - 8));
      
      // Размер платформы (чем выше, тем меньше)
      const progress = (this.height - nextY) / this.height;
      const platformWidth = Math.max(3, Math.floor(8 - progress * 4));
      
      path.push({
        x: nextX,
        y: nextY,
        width: platformWidth
      });
      
      currentX = nextX;
      currentY = nextY;
    }
    
    // Финишная платформа
    path.push({
      x: Math.floor(this.width / 2) - 3,
      y: 3,
      width: 7
    });
    
    return path;
  }

  // Размещаем платформы по пути
  placePlatformsAlongPath(path) {
    for (const platform of path) {
      for (let x = platform.x; x < platform.x + platform.width; x++) {
        if (x >= 1 && x < this.width - 1) {
          this.map[platform.y][x] = Constants.TILE_TYPES.SOLID;
        }
      }
    }
  }

  // Добавляем дополнительные платформы (не на главном пути)
  addExtraPlatforms(mainPath) {
    const numExtraPlatforms = this.random(15, 25);
    
    for (let i = 0; i < numExtraPlatforms; i++) {
      const y = this.random(10, this.height - 10);
      const x = this.random(3, this.width - 8);
      const width = this.random(2, 5);
      
      // Проверяем что не пересекается с главным путем
      let tooClose = false;
      for (const pathPlatform of mainPath) {
        if (Math.abs(pathPlatform.y - y) < 3 && 
            Math.abs(pathPlatform.x - x) < 5) {
          tooClose = true;
          break;
        }
      }
      
      if (!tooClose) {
        // Размещаем дополнительную платформу
        for (let px = x; px < x + width && px < this.width - 1; px++) {
          if (this.map[y][px] === Constants.TILE_TYPES.EMPTY) {
            this.map[y][px] = Constants.TILE_TYPES.SOLID;
          }
        }
      }
    }
  }

  // Добавление препятствий
  addObstacles() {
    for (let y = this.height - 10; y > 10; y--) {
      for (let x = 1; x < this.width - 1; x++) {
        // Если это твердый блок и над ним пусто
        if (this.map[y][x] === Constants.TILE_TYPES.SOLID && 
            this.map[y - 1][x] === Constants.TILE_TYPES.EMPTY) {
          
          const zoneHeight = this.height - y;
          
          // Вероятность препятствий (20% базовая, растет с высотой)
          const obstacleProbability = Math.min(0.35, 0.15 + (zoneHeight / 300));
          
          if (this.rng() < obstacleProbability) {
            const obstacleType = this.rng();
            
            if (obstacleType < 0.40) {
              // 40% - Лед
              this.map[y][x] = Constants.TILE_TYPES.ICE;
              
              // Иногда цепочка льда
              if (this.rng() < 0.4 && x < this.width - 3) {
                const iceLength = this.random(1, 3);
                for (let i = 1; i <= iceLength && x + i < this.width - 1; i++) {
                  if (this.map[y][x + i] === Constants.TILE_TYPES.SOLID) {
                    this.map[y][x + i] = Constants.TILE_TYPES.ICE;
                  }
                }
              }
            } else if (obstacleType < 0.65) {
              // 25% - Снег
              this.map[y][x] = Constants.TILE_TYPES.SNOW;
              
              // Иногда группа снега
              if (this.rng() < 0.3 && x < this.width - 2) {
                const snowLength = this.random(1, 2);
                for (let i = 1; i <= snowLength && x + i < this.width - 1; i++) {
                  if (this.map[y][x + i] === Constants.TILE_TYPES.SOLID) {
                    this.map[y][x + i] = Constants.TILE_TYPES.SNOW;
                  }
                }
              }
            } else if (obstacleType < 0.82) {
              // 17% - Горка влево
              if (this.canPlaceSlopeLeft(x, y)) {
                this.placeSlopeLeft(x, y);
              }
            } else if (obstacleType < 0.99) {
              // 17% - Горка вправо
              if (this.canPlaceSlopeRight(x, y)) {
                this.placeSlopeRight(x, y);
              }
            }
          }
        }
      }
    }
  }

  // Проверка возможности размещения горки ВЛЕВО (◣)
  canPlaceSlopeLeft(x, y) {
    // Нужно место слева и выше (диагональ влево-вверх)
    if (x < 3 || y <= 5) return false;
    
    // Проверяем что слева и выше есть место для диагонали
    for (let i = 0; i < 3; i++) {
      const checkX = x - i;
      const checkY = y - i;
      
      if (checkX < 1 || checkY < 0) return false;
      
      // Проверяем что этот блок либо пустой, либо твердый (можем заменить)
      const tile = this.map[checkY][checkX];
      if (tile !== Constants.TILE_TYPES.EMPTY && tile !== Constants.TILE_TYPES.SOLID) {
        return false;
      }
    }
    
    // Проверяем что над горкой есть место (3 блока)
    for (let i = 0; i < 3; i++) {
      const checkX = x - i;
      const checkY = y - i - 1;
      
      if (checkY >= 0 && this.map[checkY][checkX] !== Constants.TILE_TYPES.EMPTY) {
        return false;
      }
    }
    
    return true;
  }

  // Размещение горки ВЛЕВО (◣)
  placeSlopeLeft(startX, startY) {
    // Горка: 3 блока по диагонали влево-вверх
    this.map[startY][startX] = Constants.TILE_TYPES.SLOPE_LEFT;
    
    if (startX - 1 >= 1 && startY - 1 >= 0) {
      this.map[startY - 1][startX - 1] = Constants.TILE_TYPES.SLOPE_LEFT;
    }
    
    if (startX - 2 >= 1 && startY - 2 >= 0) {
      this.map[startY - 2][startX - 2] = Constants.TILE_TYPES.SLOPE_LEFT;
    }
  }

  // Проверка возможности размещения горки ВПРАВО (◢)
  canPlaceSlopeRight(x, y) {
    // Нужно место справа и выше (диагональ вправо-вверх)
    if (x >= this.width - 4 || y <= 5) return false;
    
    // Проверяем что справа и выше есть место для диагонали
    for (let i = 0; i < 3; i++) {
      const checkX = x + i;
      const checkY = y - i;
      
      if (checkX >= this.width - 1 || checkY < 0) return false;
      
      // Проверяем что этот блок либо пустой, либо твердый (можем заменить)
      const tile = this.map[checkY][checkX];
      if (tile !== Constants.TILE_TYPES.EMPTY && tile !== Constants.TILE_TYPES.SOLID) {
        return false;
      }
    }
    
    // Проверяем что над горкой есть место (3 блока)
    for (let i = 0; i < 3; i++) {
      const checkX = x + i;
      const checkY = y - i - 1;
      
      if (checkY >= 0 && this.map[checkY][checkX] !== Constants.TILE_TYPES.EMPTY) {
        return false;
      }
    }
    
    return true;
  }

  // Размещение горки ВПРАВО (◢)
  placeSlopeRight(startX, startY) {
    // Горка: 3 блока по диагонали вправо-вверх
    this.map[startY][startX] = Constants.TILE_TYPES.SLOPE_RIGHT;
    
    if (startX + 1 < this.width - 1 && startY - 1 >= 0) {
      this.map[startY - 1][startX + 1] = Constants.TILE_TYPES.SLOPE_RIGHT;
    }
    
    if (startX + 2 < this.width - 1 && startY - 2 >= 0) {
      this.map[startY - 2][startX + 2] = Constants.TILE_TYPES.SLOPE_RIGHT;
    }
  }

  createFinish() {
    const finishY = 1;
    const finishX = Math.floor(this.width / 2) - 3;
    
    // Финишная платформа
    for (let x = finishX; x <= finishX + 6; x++) {
      if (x >= 1 && x < this.width - 1) {
        this.map[finishY][x] = Constants.TILE_TYPES.FINISH;
      }
    }
    
    // Декоративные стены
    for (let y = finishY - 2; y <= finishY + 1; y++) {
      if (y >= 0 && y < this.height) {
        this.map[y][finishX - 1] = Constants.TILE_TYPES.SOLID;
        this.map[y][finishX + 7] = Constants.TILE_TYPES.SOLID;
      }
    }
  }
}

// Экспортируем функцию генерации
function generateMap(seed) {
  const generator = new MapGenerator(seed);
  const map = generator.generate();
  
  console.log('🗺️  Generated procedural map');
  console.log(`   Seed: ${generator.seed}`);
  console.log(`   Size: ${Constants.MAP_WIDTH}x${Constants.MAP_HEIGHT}`);
  
  return map;
}

module.exports = { generateMap, MapGenerator };