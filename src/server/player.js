const GameObject = require('./object');
const Constants = require('../shared/constants');

class Player extends GameObject {
  constructor(id, username, x, y) {
    super(id, x, y, Constants.PLAYER_WIDTH, Constants.PLAYER_HEIGHT);
    this.username = username;
    this.velocityX = 0;
    this.velocityY = 0;
    this.isOnGround = false;
    this.isCharging = false;
    this.jumpCharge = 0;
    this.jumpDirection = 0; // -1 влево, 0 вверх, 1 вправо
    this.jumpCount = 0;
    this.currentTile = Constants.TILE_TYPES.EMPTY;
    this.finishTime = null;
    this.averageJumps = 0;
    this.lastInput = null;
    this.isWalking = false;
    this.groundCheckCooldown = 0;
    this.jumpCooldown = 0;
    this.canJump = true;
    this.spaceReleased = true;

    this.highestPointY = y; // Самая высокая точка во время полета
    this.isStunned = false; // Оглушен ли игрок
    this.stunDuration = 0; // Оставшееся время оглушения (в секундах)
  }

  update(dt, input, map) {
    const prevInput = this.lastInput;
    this.lastInput = input ? { ...input } : null;

    if (this.isStunned) {
      this.stunDuration -= dt;
      if (this.stunDuration <= 0) {
        this.stunDuration = 0;
        this.isStunned = false;
        console.log(`[Player ${this.username}] Stun ended`);
      }
      // Во время оглушения игнорируем input
      input = null;
    }
  
    // ВАЖНО: Обрабатываем input ПЕРЕД всем остальным
    if (input) {
      this.handleInput(input, prevInput);
    }
  
    if (this.groundCheckCooldown > 0) {
      this.groundCheckCooldown--;
    }
  
    // Обновляем кулдаун прыжка
    if (this.jumpCooldown > 0) {
      this.jumpCooldown -= dt;
      if (this.jumpCooldown <= 0) {
        this.jumpCooldown = 0;
        this.canJump = true;
      }
    }

    if (!this.isOnGround) {
      if (this.y < this.highestPointY) {
        this.highestPointY = this.y; // Обновляем самую высокую точку
      }
    }

    const previousTile = this.currentTile;
    this.currentTile = this.getCurrentGroundTile(map);
  
    // КРИТИЧЕСКИ ВАЖНО: Обновляем направление прыжка ПЕРЕД зарядкой
    if (this.isCharging && this.isOnGround) {
      if (input && input.left && !input.right) {
        this.jumpDirection = -1;
      } else if (input && input.right && !input.left) {
        this.jumpDirection = 1;
      } else if (input && !input.left && !input.right) {
        this.jumpDirection = 0;
      }
    }
  
    // Зарядка прыжка
    if (this.isCharging && this.isOnGround && this.canJump) {
      this.jumpCharge += Constants.JUMP_CHARGE_RATE;
      
      // Если достигли максимума - автоматически прыгаем
      if (this.jumpCharge >= Constants.JUMP_MAX_POWER) {
        this.jumpCharge = Constants.JUMP_MAX_POWER;
        
        console.log(`[DEBUG] Auto-jump with direction: ${this.jumpDirection}`);
        
        this.performJump(); // ЭТО УСТАНАВЛИВАЕТ velocityX
        this.spaceReleased = false;
        // НЕ ОБНУЛЯЕМ velocityX ПОСЛЕ ПРЫЖКА!
      } else {
        this.jumpCharge = Math.min(this.jumpCharge, Constants.JUMP_MAX_POWER);
        this.velocityX = 0; // Обнуляем только если продолжаем заряжаться
      }
    }
  
    // Ходьба (выполняется ПОСЛЕ зарядки, поэтому не перезаписывает velocityX от прыжка)
    if (this.isOnGround && !this.isCharging) {
      this.isWalking = false;
      
      if (this.currentTile === Constants.TILE_TYPES.SNOW) {
        this.velocityX = 0;
      } else if (this.currentTile === Constants.TILE_TYPES.ICE) {
        if (input && input.left && !input.right) {
          this.velocityX -= 0.3;
          this.isWalking = true;
        } else if (input && input.right && !input.left) {
          this.velocityX += 0.3;
          this.isWalking = true;
        }
        
        this.velocityX *= 0.98;
        
        const maxIceSpeed = 6;
        if (this.velocityX > maxIceSpeed) this.velocityX = maxIceSpeed;
        if (this.velocityX < -maxIceSpeed) this.velocityX = -maxIceSpeed;
        
        if (Math.abs(this.velocityX) < 0.1) {
          this.velocityX = 0;
        }
      } else {
        if (input && input.left && !input.right) {
          this.velocityX = -Constants.PLAYER_WALK_SPEED;
          this.isWalking = true;
        } else if (input && input.right && !input.left) {
          this.velocityX = Constants.PLAYER_WALK_SPEED;
          this.isWalking = true;
        } else {
          this.velocityX = 0;
        }
      }
    }
  
    // Скатывание с горки
    if (this.currentTile === Constants.TILE_TYPES.SLOPE_LEFT && this.isOnGround) {
      this.velocityX = -Constants.SLOPE_SLIDE_SPEED; // Влево (отрицательная скорость)
      this.velocityY = Constants.SLOPE_SLIDE_SPEED;
      this.isOnGround = false;
      this.isCharging = false;
      this.jumpCharge = 0;
      this.groundCheckCooldown = 5;
    }
    
    // Скатывание с горки ВПРАВО
    if (this.currentTile === Constants.TILE_TYPES.SLOPE_RIGHT && this.isOnGround) {
      this.velocityX = Constants.SLOPE_SLIDE_SPEED; // Вправо (положительная скорость)
      this.velocityY = Constants.SLOPE_SLIDE_SPEED;
      this.isOnGround = false;
      this.isCharging = false;
      this.jumpCharge = 0;
      this.groundCheckCooldown = 5;
    }
  
    // Гравитация
    if (!this.isOnGround || this.velocityY > 0) {
      this.velocityY += Constants.GRAVITY;
      this.velocityY = Math.min(this.velocityY, 80);
    } else {
      this.velocityY = 0;
    }
  
    // Коллизии
    this.handleHorizontalCollisions(map);
    this.handleVerticalCollisions(map);
  
    this.x = Math.max(0, Math.min(this.x, Constants.MAP_WIDTH * Constants.TILE_SIZE - this.width));

    if (this.currentTile === Constants.TILE_TYPES.FINISH && !this.finishTime) {
      this.finishTime = Date.now();
      this.averageJumps = this.jumpCount;
    }
  }

  handleInput(input, prevInput) {
    // Отслеживаем отпускание пробела
    if (!input.space && prevInput && prevInput.space) {
      this.spaceReleased = true;
      
      // Если зарядка была активна - прыгаем
      if (this.isCharging) {
        console.log(`[DEBUG] Manual jump with direction: ${this.jumpDirection}`); // Отладка
        this.performJump();
      }
    }
  
    // Начинаем зарядку
    if (input.space && (!prevInput || !prevInput.space)) {
      if (this.spaceReleased && this.isOnGround && !this.isCharging && this.canJump) {
        this.isCharging = true;
        this.jumpCharge = Constants.JUMP_MIN_POWER;
        
        // Устанавливаем начальное направление
        if (input.left && !input.right) {
          this.jumpDirection = -1;
        } else if (input.right && !input.left) {
          this.jumpDirection = 1;
        } else {
          this.jumpDirection = 0;
        }
        
        console.log(`[DEBUG] Start charging, initial direction: ${this.jumpDirection}`); // Отладка
        
        this.velocityX = 0;
      }
    }
  }

  performJump() {
    if (!this.isOnGround) {
      this.isCharging = false;
      this.jumpCharge = 0;
      return;
    }

    // МЕХАНИКА JUMP KING:
    // Зарядка влияет на силу И на угол прыжка
    // Малая зарядка = пологий прыжок (больше горизонтали)
    // Большая зарядка = крутой прыжок (больше вертикали)

    const jumpPower = this.jumpCharge;

    // Вычисляем процент зарядки (от 0 до 1)
    const chargeRatio = (this.jumpCharge - Constants.JUMP_MIN_POWER) /
      (Constants.JUMP_MAX_POWER - Constants.JUMP_MIN_POWER);

    let angle;

    if (this.jumpDirection === 0) {
      // Прямо вверх - всегда 90 градусов
      angle = Math.PI / 2;
    } else {
      // Диагональный прыжок - угол меняется от 45° до 75° в зависимости от зарядки
      // При 0% зарядки: 45° (пологий, дальний прыжок)
      // При 100% зарядки: 75° (крутой, высокий прыжок)
      const minAngle = 45; // Минимальный угол (более горизонтальный)
      const maxAngle = 72; // Максимальный угол (более вертикальный)
      const angleDegrees = minAngle + (maxAngle - minAngle) * chargeRatio;
      angle = (angleDegrees * Math.PI) / 180;
    }

    // Разложение скорости на компоненты
    this.velocityY = -jumpPower * Math.sin(angle);
    const horizontalComponent = jumpPower * Math.cos(angle);
    this.velocityX = horizontalComponent * this.jumpDirection;

    this.isOnGround = false;
    this.isCharging = false;
    this.jumpCharge = 0;
    this.jumpCount++;
    this.groundCheckCooldown = 3;
    this.jumpCooldown = Constants.JUMP_COOLDOWN;
    this.canJump = false;
    this.spaceReleased = false;
  }

  handleHorizontalCollisions(map) {
    if (Math.abs(this.velocityX) < 0.01) return;
  
    const top = this.y + 2;
    const bottom = this.y + this.height - 2;
  
    const topTileY = Math.floor(top / Constants.TILE_SIZE);
    const bottomTileY = Math.floor(bottom / Constants.TILE_SIZE);
  
    if (this.velocityX > 0) {
      const steps = Math.ceil(Math.abs(this.velocityX));
      const stepSize = this.velocityX / steps;
      
      for (let step = 0; step < steps; step++) {
        this.x += stepSize;
        
        const right = this.x + this.width;
        const rightTileX = Math.floor(right / Constants.TILE_SIZE);
        
        let hitWall = false;
        
        for (let y = topTileY; y <= bottomTileY; y++) {
          const tile = this.getTile(map, rightTileX, y);
          if (tile !== Constants.TILE_TYPES.EMPTY) {
            const tileLeft = rightTileX * Constants.TILE_SIZE;
            
            if (right >= tileLeft) {
              this.x = tileLeft - this.width;
              
              const impactSpeed = Math.abs(this.velocityX);
              
              if (impactSpeed > Constants.WALL_BOUNCE_THRESHOLD) {
                this.velocityX = -impactSpeed * Constants.WALL_BOUNCE_FACTOR;
              } else {
                this.velocityX = 0;
              }
              
              hitWall = true;
              break;
            }
          }
        }
        
        if (hitWall) {
          break;
        }
      }
    } else if (this.velocityX < 0) {
      const steps = Math.ceil(Math.abs(this.velocityX));
      const stepSize = this.velocityX / steps;
      
      for (let step = 0; step < steps; step++) {
        this.x += stepSize;
        
        const left = this.x;
        const leftTileX = Math.floor(left / Constants.TILE_SIZE);
        
        let hitWall = false;
        
        for (let y = topTileY; y <= bottomTileY; y++) {
          const tile = this.getTile(map, leftTileX, y);
          if (tile !== Constants.TILE_TYPES.EMPTY) {
            const tileRight = (leftTileX + 1) * Constants.TILE_SIZE;
            
            if (left <= tileRight) {
              this.x = tileRight;
              
              const impactSpeed = Math.abs(this.velocityX);
              
              if (impactSpeed > Constants.WALL_BOUNCE_THRESHOLD) {
                this.velocityX = impactSpeed * Constants.WALL_BOUNCE_FACTOR;
              } else {
                this.velocityX = 0;
              }
              
              hitWall = true;
              break;
            }
          }
        }
        
        if (hitWall) {
          break;
        }
      }
    }
  }

  handleVerticalCollisions(map) {
    const left = this.x + 1;
    const right = this.x + this.width - 1;
    const top = this.y;
    const bottom = this.y + this.height;
  
    const leftTileX = Math.floor(left / Constants.TILE_SIZE);
    const rightTileX = Math.floor(right / Constants.TILE_SIZE);
  
    let wasOnGround = this.isOnGround;
  
    // Падение вниз
    if (this.velocityY >= 0) {
      // НОВЫЙ ПОДХОД: Проверяем землю перед движением
      if (this.isOnGround && this.groundCheckCooldown === 0) {
        const currentBottomTileY = Math.floor(bottom / Constants.TILE_SIZE);
        let stillOnGround = false;
  
        // Проверяем текущий тайл
        for (let x = leftTileX; x <= rightTileX; x++) {
          const tile = this.getTile(map, x, currentBottomTileY);
          if (tile !== Constants.TILE_TYPES.EMPTY) {
            const tileTop = currentBottomTileY * Constants.TILE_SIZE;
            if (Math.abs(bottom - tileTop) < 4) {
              stillOnGround = true;
              this.y = tileTop - this.height;
              this.velocityY = 0;
              break;
            }
          }
        }
  
        // Проверяем тайл ниже
        if (!stillOnGround) {
          const belowTileY = currentBottomTileY + 1;
          for (let x = leftTileX; x <= rightTileX; x++) {
            const tile = this.getTile(map, x, belowTileY);
            if (tile !== Constants.TILE_TYPES.EMPTY) {
              const tileTop = belowTileY * Constants.TILE_SIZE;
              if (bottom >= tileTop - 4 && bottom <= tileTop + 4) {
                stillOnGround = true;
                this.y = tileTop - this.height;
                this.velocityY = 0;
                // this.currentTile = tile;
                break;
              }
            }
          }
        }
  
        this.isOnGround = stillOnGround;
      }
  
      // КЛЮЧЕВОЕ ИЗМЕНЕНИЕ: Пошаговое движение с проверкой на каждый пиксель
      if (!this.isOnGround && this.velocityY > 0) {
        const steps = Math.ceil(Math.abs(this.velocityY)); // Движемся по 1 пикселю
        const stepSize = this.velocityY / steps;
        
        for (let step = 0; step < steps; step++) {
          // Двигаем на маленький шаг
          this.y += stepSize;
          
          const newBottom = this.y + this.height;
          const newBottomTileY = Math.floor(newBottom / Constants.TILE_SIZE);
          
          // Проверяем коллизию после каждого шага
          let hitGround = false;
          
          for (let x = leftTileX; x <= rightTileX; x++) {
            const tile = this.getTile(map, x, newBottomTileY);
            
            if (tile !== Constants.TILE_TYPES.EMPTY) {
              const tileTop = newBottomTileY * Constants.TILE_SIZE;
              
              // Если мы пересекли верхнюю границу тайла
              if (newBottom >= tileTop) {

                const playerCenterX = this.x + this.width / 2;
                if (!this.isSlopeTilePassable(tile, playerCenterX, x, newBottomTileY, map)) {
                  continue; // Пропускаем этот тайл, ищем дальше
                }
                // Ставим точно на платформу
                this.y = tileTop - this.height;
                this.velocityY = 0;
                this.isOnGround = true;
                // this.currentTile = tile;
                this.groundCheckCooldown = 0;
                hitGround = true;
  
                // Обработка приземления
                if (!wasOnGround) {
                  // НОВОЕ: Проверяем высоту падения
                  const fallDistance = (this.y - this.highestPointY) / Constants.TILE_SIZE; // В тайлах
                  
                  if (fallDistance > Constants.STUN_FALL_THRESHOLD) {
                    // Слишком высокое падение - оглушаем игрока
                    this.isStunned = true;
                    this.stunDuration = Constants.STUN_DURATION;
                    console.log(`[Player ${this.username}] Stunned! Fell ${fallDistance.toFixed(1)} tiles`);
                  }
                  
                  // Сбрасываем самую высокую точку
                  this.highestPointY = this.y;
                  
                  if (tile === Constants.TILE_TYPES.ICE) {
                    this.velocityX *= 0.9;
                  } else if (tile === Constants.TILE_TYPES.SNOW) {
                    this.velocityX = 0;
                  } else if (tile !== Constants.TILE_TYPES.SLOPE_LEFT && tile !== Constants.TILE_TYPES.SLOPE_RIGHT) {
                    this.velocityX *= 0.4;
                    if (Math.abs(this.velocityX) < 0.3) {
                      this.velocityX = 0;
                    }
                  }
                }
  
                // Финиш
                // if (tile === Constants.TILE_TYPES.FINISH && !this.finishTime) {
                //   this.finishTime = Date.now();
                //   this.averageJumps = this.jumpCount;
                // }
                
                break;
              }
            }
          }
          
          // Если приземлились - прерываем движение
          if (hitGround) {
            break;
          }
        }
      }
    }
    // Движение вверх
    else if (this.velocityY < 0) {
      this.isOnGround = false;
      
      // Пошаговое движение вверх
      const steps = Math.ceil(Math.abs(this.velocityY));
      const stepSize = this.velocityY / steps;
      
      for (let step = 0; step < steps; step++) {
        this.y += stepSize;
        
        const newTop = this.y;
        const newTopTileY = Math.floor(newTop / Constants.TILE_SIZE);
        
        let hitCeiling = false;
        
        for (let x = leftTileX; x <= rightTileX; x++) {
          const tile = this.getTile(map, x, newTopTileY);
          
          if (tile !== Constants.TILE_TYPES.EMPTY) {
            const tileBottom = (newTopTileY + 1) * Constants.TILE_SIZE;
            
            if (newTop <= tileBottom) {
              this.y = tileBottom;
              this.velocityY = 0;
              hitCeiling = true;
              break;
            }
          }
        }
        
        if (hitCeiling) {
          break;
        }
      }
    }
  }

  // Проверяет является ли тайл горкой и можно ли на него встать
  isSlopeTilePassable(tile, fromX, tileX, tileY, map) {
    if (tile === Constants.TILE_TYPES.SLOPE_LEFT) {
      // Горка влево (◣) непроходима справа и снизу
      // Можно встать только если подходим слева или сверху
      
      // Если игрок справа от тайла - непроходим
      const tileRight = (tileX + 1) * Constants.TILE_SIZE;
      if (fromX > tileRight - Constants.TILE_SIZE * 0.5) {
        return false; // Непроходим справа
      }
      
      return true; // Проходим слева/сверху
    }
    
    if (tile === Constants.TILE_TYPES.SLOPE_RIGHT) {
      // Горка вправо (◢) непроходима слева и снизу
      // Можно встать только если подходим справа или сверху
      
      // Если игрок слева от тайла - непроходим
      const tileLeft = tileX * Constants.TILE_SIZE;
      if (fromX < tileLeft + Constants.TILE_SIZE * 0.5) {
        return false; // Непроходим слева
      }
      
      return true; // Проходим справа/сверху
    }
    
    return true; // Не горка - проходим
  }

  // Определяет тип тайла под ногами игрока
  getCurrentGroundTile(map) {
    if (!this.isOnGround) {
      return Constants.TILE_TYPES.EMPTY;
    }

    const left = this.x + 1;
    const right = this.x + this.width - 1;
    const bottom = this.y + this.height;

    const leftTileX = Math.floor(left / Constants.TILE_SIZE);
    const rightTileX = Math.floor(right / Constants.TILE_SIZE);
    const bottomTileY = Math.floor(bottom / Constants.TILE_SIZE);

    // ПРИОРИТЕТ: Ищем особые блоки (лед, снег, горка, финиш) в первую очередь
    const specialTiles = [
      Constants.TILE_TYPES.FINISH,
      Constants.TILE_TYPES.SNOW,
      Constants.TILE_TYPES.ICE,
      Constants.TILE_TYPES.SLOPE_LEFT,
      Constants.TILE_TYPES.SLOPE_RIGHT
    ];

    // Проверяем все тайлы под ногами
    for (let x = leftTileX; x <= rightTileX; x++) {
      const tile = this.getTile(map, x, bottomTileY);
      
      // Если нашли особый блок - возвращаем его сразу
      if (specialTiles.includes(tile)) {
        return tile;
      }
    }

    // Если особых блоков нет, возвращаем любой твердый блок
    for (let x = leftTileX; x <= rightTileX; x++) {
      const tile = this.getTile(map, x, bottomTileY);
      if (tile !== Constants.TILE_TYPES.EMPTY) {
        return tile;
      }
    }

    return Constants.TILE_TYPES.EMPTY;
  }

  getTile(map, x, y) {
    if (x < 0 || x >= Constants.MAP_WIDTH || y < 0 || y >= Constants.MAP_HEIGHT) {
      return Constants.TILE_TYPES.SOLID;
    }
    return map[y][x];
  }

  serializeForUpdate() {
    // ОПТИМИЗАЦИЯ: округляем до целых (экономия ~30% размера данных)
    // Разница в 1px незаметна на глаз
    return {
      id: this.id,
      x: Math.round(this.x),
      y: Math.round(this.y),
      username: this.username,
      isCharging: this.isCharging,
      jumpCharge: this.isCharging ? Math.round(this.jumpCharge) : 0,
      jumpDirection: this.jumpDirection,
      jumpCount: this.jumpCount,
      finishTime: this.finishTime,
      averageJumps: this.averageJumps,
      isOnGround: this.isOnGround,
      isWalking: this.isWalking,
      isStunned: this.isStunned, // НОВОЕ
      // stunDuration: this.stunDuration
      // canJump: this.canJump
    };
  }
}

module.exports = Player;