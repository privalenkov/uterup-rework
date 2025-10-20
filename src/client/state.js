const RENDER_DELAY = 100;

const gameUpdates = [];
let gameStart = 0;
let firstServerTimestamp = 0;
let gameMap = null;

export function initState() {
  gameStart = 0;
  firstServerTimestamp = 0;
  gameUpdates.length = 0;
}

export function processGameUpdate(update) {
  if (!firstServerTimestamp) {
    firstServerTimestamp = update.t;
    gameStart = Date.now();
  }

  gameUpdates.push(update);

  if (update.map) {
    gameMap = update.map;
  }

  const base = getBaseUpdate();
  if (base > 0) {
    gameUpdates.splice(0, base);
  }
}

function currentServerTime() {
  return firstServerTimestamp + (Date.now() - gameStart) - RENDER_DELAY;
}

function getBaseUpdate() {
  const serverTime = currentServerTime();
  for (let i = gameUpdates.length - 1; i >= 0; i--) {
    if (gameUpdates[i].t <= serverTime) {
      return i;
    }
  }
  return -1;
}

export function getCurrentState() {
  if (!firstServerTimestamp) {
    return {};
  }

  const base = getBaseUpdate();
  const serverTime = currentServerTime();

  if (base < 0 || base === gameUpdates.length - 1) {
    const latestUpdate = gameUpdates[gameUpdates.length - 1];
    return {
      ...latestUpdate,
      map: gameMap
    };
  } else {
    const baseUpdate = gameUpdates[base];
    const next = gameUpdates[base + 1];
    const ratio = (serverTime - baseUpdate.t) / (next.t - baseUpdate.t);

    return {
      me: interpolateObject(baseUpdate.me, next.me, ratio),
      others: interpolateObjectArray(baseUpdate.others, next.others, ratio),
      leaderboard: baseUpdate.leaderboard,
      map: gameMap
    };
  }
}

function interpolateObject(obj1, obj2, ratio) {
  if (!obj1 || !obj2) {
    return obj1 || obj2;
  }

  const interpolated = { ...obj1 };
  
  // Интерполируем числовые значения
  ['x', 'y', 'jumpCharge', 'velocityY'].forEach(key => {
    if (typeof obj1[key] === 'number' && typeof obj2[key] === 'number') {
      interpolated[key] = obj1[key] + (obj2[key] - obj1[key]) * ratio;
    }
  });

  // Булевы значения берем из ближайшего обновления
  if (ratio < 0.5) {
    interpolated.isOnGround = obj1.isOnGround;
    interpolated.isCharging = obj1.isCharging;
  } else {
    interpolated.isOnGround = obj2.isOnGround;
    interpolated.isCharging = obj2.isCharging;
  }

  return interpolated;
}

function interpolateObjectArray(arr1, arr2, ratio) {
  if (!arr1 || !arr2) {
    return arr1 || arr2 || [];
  }

  return arr1.map(obj1 => {
    const obj2 = arr2.find(o => o.id === obj1.id);
    return obj2 ? interpolateObject(obj1, obj2, ratio) : obj1;
  });
}