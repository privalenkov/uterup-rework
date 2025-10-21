const fs = require('fs');
const path = require('path');

class DailyMapManager {
  constructor() {
    // Используем переменную окружения для пути или fallback на локальную директорию
    const storagePath = process.env.MAPS_STORAGE_PATH || path.join(__dirname, '../../maps');
    this.mapsDir = storagePath;
    this.metaPath = path.join(this.mapsDir, 'meta.json');
    
    console.log(`📁 Maps storage path: ${this.mapsDir}`);
    
    // Создаем директорию если не существует
    if (!fs.existsSync(this.mapsDir)) {
      fs.mkdirSync(this.mapsDir, { recursive: true });
      console.log(`✅ Created maps directory: ${this.mapsDir}`);
    }

    // Инициализируем мета-данные
    this.initMeta();
  }

  initMeta() {
    if (!fs.existsSync(this.metaPath)) {
      const meta = {
        firstMapDate: null,
        totalMaps: 0,
        maps: {}
      };
      fs.writeFileSync(this.metaPath, JSON.stringify(meta, null, 2));
    }
  }

  getMeta() {
    return JSON.parse(fs.readFileSync(this.metaPath, 'utf8'));
  }

  saveMeta(meta) {
    fs.writeFileSync(this.metaPath, JSON.stringify(meta, null, 2));
  }

  // Получить дату в формате YYYY-MM-DD по московскому времени
  getMoscowDateString(date = new Date()) {
    const moscowOffset = 3 * 60; // UTC+3 в минутах
    const localOffset = date.getTimezoneOffset();
    const moscowTime = new Date(date.getTime() + (moscowOffset + localOffset) * 60000);
    
    const year = moscowTime.getFullYear();
    const month = String(moscowTime.getMonth() + 1).padStart(2, '0');
    const day = String(moscowTime.getDate()).padStart(2, '0');
    
    return `${year}-${month}-${day}`;
  }

  // Получить номер карты по дате
  getMapNumber(targetDate) {
    const meta = this.getMeta();
    
    if (!meta.firstMapDate) {
      return null;
    }

    const firstDate = new Date(meta.firstMapDate + 'T00:00:00+03:00');
    const target = new Date(targetDate + 'T00:00:00+03:00');
    
    const daysDiff = Math.floor((target - firstDate) / (1000 * 60 * 60 * 24));
    
    if (daysDiff < 0) {
      return null;
    }

    return daysDiff + 1;
  }

  // Публикация карты
  publishMap(dateString, map, authorUsername) {
    const meta = this.getMeta();
    
    // Проверяем формат даты
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateString)) {
      throw new Error('Неверный формат даты. Используйте YYYY-MM-DD');
    }

    // Проверяем что дата не в прошлом (кроме сегодня)
    const today = this.getMoscowDateString();
    const targetDate = new Date(dateString + 'T00:00:00+03:00');
    const todayDate = new Date(today + 'T00:00:00+03:00');

    if (targetDate < todayDate) {
      throw new Error('Нельзя публиковать карты на прошедшие даты');
    }

    const isUpdate = meta.maps[dateString] !== undefined;
    let mapNumber;

    // Если это первая карта - устанавливаем начальную дату
    if (!meta.firstMapDate) {
      meta.firstMapDate = dateString;
      meta.totalMaps = 1;
      mapNumber = 1;
    } else {
      const firstDate = new Date(meta.firstMapDate + 'T00:00:00+03:00');
      if (targetDate < firstDate) {
        throw new Error('Дата карты не может быть раньше первой опубликованной карты');
      }
      
      // Если обновляем существующую карту - берем её номер
      if (isUpdate) {
        mapNumber = meta.maps[dateString].mapNumber;
      } else {
        // Если новая карта - вычисляем номер
        mapNumber = this.getMapNumber(dateString);
        if (!mapNumber) {
          // Если по какой-то причине не получилось вычислить - ставим следующий
          mapNumber = meta.totalMaps + 1;
        }
      }
    }

    // Сохраняем карту
    const mapData = {
      date: dateString,
      mapNumber: mapNumber,
      map: map,
      authorUsername: authorUsername,
      publishedAt: new Date().toISOString(),
      averageJumps: null // Будет обновляться по мере прохождения игроками
    };

    meta.maps[dateString] = mapData;
    
    // Обновляем totalMaps если это не обновление
    if (!isUpdate) {
      meta.totalMaps++;
    }

    this.saveMeta(meta);

    console.log(`✅ Map published for ${dateString} (Map #${mapNumber})`);

    return {
      mapNumber: mapNumber,
      date: dateString,
      isUpdate: isUpdate
    };
  }

  // Получить карту на сегодня
  getDailyMap() {
    const today = this.getMoscowDateString();
    return this.getMapByDate(today);
  }

  // Получить карту по дате
  getMapByDate(dateString) {
    const meta = this.getMeta();
    
    const mapData = meta.maps[dateString];
    
    if (!mapData) {
      return null;
    }

    return {
      mapNumber: mapData.mapNumber,
      date: mapData.date,
      map: mapData.map,
      authorUsername: mapData.authorUsername,
      averageJumps: mapData.averageJumps
    };
  }

  // Обновить средний результат для карты
  updateAverageJumps(dateString, averageJumps) {
    const meta = this.getMeta();
    
    if (meta.maps[dateString]) {
      meta.maps[dateString].averageJumps = averageJumps;
      this.saveMeta(meta);
    }
  }
}

module.exports = { DailyMapManager };