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
  }

  update(dt, input, map) {
    const prevInput = this.lastInput;
    this.lastInput = input ? { ...input } : null;

    if (input) {
      this.handleInput(input, prevInput);
    }

    if (this.groundCheckCooldown > 0) {
      this.groundCheckCooldown--;
    }

    // Зарядка прыжка
    if (this.isCharging && this.isOnGround) {
      this.jumpCharge += Constants.JUMP_CHARGE_RATE;
      this.jumpCharge = Math.min(this.jumpCharge, Constants.JUMP_MAX_POWER);
      this.velocityX = 0;
    }

    // Ходьба
    if (this.isOnGround && !this.isCharging) {
      this.isWalking = false;

      if (this.currentTile === Constants.TILE_TYPES.SNOW) {
        // На снегу нельзя ходить вообще
        this.velocityX = 0;
      } else if (this.currentTile === Constants.TILE_TYPES.ICE) {
        // На льду можно управлять, но с меньшей силой + скольжение
        if (input && input.left && !input.right) {
          this.velocityX -= 0.3; // Ускорение влево
          this.isWalking = true;
        } else if (input && input.right && !input.left) {
          this.velocityX += 0.3; // Ускорение вправо
          this.isWalking = true;
        }

        // Применяем скольжение (слабое трение)
        this.velocityX *= 0.99;

        // Ограничиваем максимальную скорость на льду
        const maxIceSpeed = 8;
        if (this.velocityX > maxIceSpeed) this.velocityX = maxIceSpeed;
        if (this.velocityX < -maxIceSpeed) this.velocityX = -maxIceSpeed;

        if (Math.abs(this.velocityX) < 0.1) {
          this.velocityX = 0;
        }
      } else {
        // Обычная ходьба на нормальных поверхностях
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
    if (this.currentTile === Constants.TILE_TYPES.SLOPE && this.isOnGround) {
      this.velocityX = Constants.SLOPE_SLIDE_SPEED;
      this.velocityY = Constants.SLOPE_SLIDE_SPEED;
      this.isOnGround = false;
      this.isCharging = false;
      this.jumpCharge = 0;
      this.groundCheckCooldown = 5;
    }

    // Гравитация
    if (!this.isOnGround || this.velocityY > 0) {
      this.velocityY += Constants.GRAVITY;
      this.velocityY = Math.min(this.velocityY, 35);
    } else {
      this.velocityY = 0;
    }

    // Двигаемся
    this.x += this.velocityX;
    this.handleHorizontalCollisions(map);

    this.y += this.velocityY;
    this.handleVerticalCollisions(map);

    this.x = Math.max(0, Math.min(this.x, Constants.MAP_WIDTH * Constants.TILE_SIZE - this.width));
  }

  handleInput(input, prevInput) {
    if (this.isOnGround) {
      if (input.left && !input.right) {
        this.jumpDirection = -1;
      } else if (input.right && !input.left) {
        this.jumpDirection = 1;
      } else if (!input.left && !input.right) {
        this.jumpDirection = 0;
      }
    }

    if (input.space && (!prevInput || !prevInput.space)) {
      if (this.isOnGround && !this.isCharging) {
        this.isCharging = true;
        this.jumpCharge = Constants.JUMP_MIN_POWER;
        this.velocityX = 0;
      }
    }

    if (!input.space && prevInput && prevInput.space) {
      if (this.isCharging) {
        this.performJump();
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
      const maxAngle = 75; // Максимальный угол (более вертикальный)
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
  }

  handleHorizontalCollisions(map) {
    const left = this.x;
    const right = this.x + this.width;
    const top = this.y + 2;
    const bottom = this.y + this.height - 2;

    const topTileY = Math.floor(top / Constants.TILE_SIZE);
    const bottomTileY = Math.floor(bottom / Constants.TILE_SIZE);

    if (this.velocityX > 0) {
      const rightTileX = Math.floor(right / Constants.TILE_SIZE);

      for (let y = topTileY; y <= bottomTileY; y++) {
        const tile = this.getTile(map, rightTileX, y);
        if (tile !== Constants.TILE_TYPES.EMPTY) {
          const tileLeft = rightTileX * Constants.TILE_SIZE;
          if (right > tileLeft) {
            this.x = tileLeft - this.width;
            this.velocityX = 0;
            break;
          }
        }
      }
    } else if (this.velocityX < 0) {
      const leftTileX = Math.floor(left / Constants.TILE_SIZE);

      for (let y = topTileY; y <= bottomTileY; y++) {
        const tile = this.getTile(map, leftTileX, y);
        if (tile !== Constants.TILE_TYPES.EMPTY) {
          const tileRight = (leftTileX + 1) * Constants.TILE_SIZE;
          if (left < tileRight) {
            this.x = tileRight;
            this.velocityX = 0;
            break;
          }
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
      if (this.isOnGround && this.groundCheckCooldown === 0) {
        const currentBottomTileY = Math.floor(bottom / Constants.TILE_SIZE);
        let stillOnGround = false;
  
        for (let x = leftTileX; x <= rightTileX; x++) {
          const tile = this.getTile(map, x, currentBottomTileY);
          if (tile !== Constants.TILE_TYPES.EMPTY) {
            const tileTop = currentBottomTileY * Constants.TILE_SIZE;
            if (Math.abs(bottom - tileTop) < 3) {
              stillOnGround = true;
              this.y = tileTop - this.height;
              this.velocityY = 0;
              break;
            }
          }
        }
  
        if (!stillOnGround) {
          const belowTileY = currentBottomTileY + 1;
          for (let x = leftTileX; x <= rightTileX; x++) {
            const tile = this.getTile(map, x, belowTileY);
            if (tile !== Constants.TILE_TYPES.EMPTY) {
              const tileTop = belowTileY * Constants.TILE_SIZE;
              if (bottom >= tileTop - 3 && bottom <= tileTop + 3) {
                stillOnGround = true;
                this.y = tileTop - this.height;
                this.velocityY = 0;
                this.currentTile = tile;
                break;
              }
            }
          }
        }
  
        this.isOnGround = stillOnGround;
      }
  
      if (!this.isOnGround && this.velocityY > 0) {
        const currentBottomTileY = Math.floor(bottom / Constants.TILE_SIZE);
        const nextBottomTileY = Math.floor((bottom + this.velocityY) / Constants.TILE_SIZE);
        
        // ОПТИМИЗАЦИЯ: проверяем максимум 5 тайлов вперед
        // (при velocityY=35 и TILE_SIZE=32 это ~1 тайл, так что безопасно)
        const maxCheck = Math.min(nextBottomTileY, currentBottomTileY + 5);
        let collisionFound = false;
        
        for (let checkY = currentBottomTileY; checkY <= maxCheck && !collisionFound; checkY++) {
          for (let x = leftTileX; x <= rightTileX; x++) {
            const tile = this.getTile(map, x, checkY);
            
            if (tile !== Constants.TILE_TYPES.EMPTY) {
              const tileTop = checkY * Constants.TILE_SIZE;
              
              if (bottom <= tileTop && (bottom + this.velocityY) >= tileTop) {
                this.y = tileTop - this.height;
                this.velocityY = 0;
                this.isOnGround = true;
                this.currentTile = tile;
                this.groundCheckCooldown = 0;
                collisionFound = true;
  
                if (!wasOnGround) {
                  if (tile === Constants.TILE_TYPES.ICE) {
                    this.velocityX *= 0.9;
                  } else if (tile === Constants.TILE_TYPES.SNOW) {
                    this.velocityX = 0;
                  } else if (tile !== Constants.TILE_TYPES.SLOPE) {
                    this.velocityX *= 0.4;
                    if (Math.abs(this.velocityX) < 0.3) {
                      this.velocityX = 0;
                    }
                  }
                }
  
                if (tile === Constants.TILE_TYPES.FINISH && !this.finishTime) {
                  this.finishTime = Date.now();
                  this.averageJumps = this.jumpCount;
                }
                
                break;
              }
            }
          }
        }
      }
    }
    else if (this.velocityY < 0) {
      this.isOnGround = false;
      
      const currentTopTileY = Math.floor(top / Constants.TILE_SIZE);
      const nextTopTileY = Math.floor((top + this.velocityY) / Constants.TILE_SIZE);
      
      // ОПТИМИЗАЦИЯ: проверяем максимум 5 тайлов вперед
      const maxCheck = Math.max(nextTopTileY, currentTopTileY - 5);
      let collisionFound = false;
      
      for (let checkY = currentTopTileY; checkY >= maxCheck && !collisionFound; checkY--) {
        for (let x = leftTileX; x <= rightTileX; x++) {
          const tile = this.getTile(map, x, checkY);
          
          if (tile !== Constants.TILE_TYPES.EMPTY) {
            const tileBottom = (checkY + 1) * Constants.TILE_SIZE;
            
            if (top >= tileBottom && (top + this.velocityY) <= tileBottom) {
              this.y = tileBottom;
              this.velocityY = 0;
              collisionFound = true;
              break;
            }
          }
        }
      }
    }
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
      isWalking: this.isWalking
    };
  }
}

module.exports = Player;