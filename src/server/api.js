// src/server/api.js
const express = require('express');
const { DailyMapManager } = require('./dailyMap');
const { generateMap } = require('./map');

function toDateString(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function createApiRouter({ dailyMapManager, onMapPublished } = {}) {
  if (!dailyMapManager) dailyMapManager = new DailyMapManager();

  const router = express.Router();

  // GET /api/daily
  router.get('/daily', (req, res) => {
    try {
      const dailyMap = dailyMapManager.getDailyMap();
      if (!dailyMap) {
        return res.status(404).json({
          error: 'No map available for today',
          message: 'Карта на сегодня не опубликована',
        });
      }
      res.json({
        mapNumber: dailyMap.mapNumber,
        date: dailyMap.date,
        map: dailyMap.map,
        averageJumps: dailyMap.averageJumps,
        authorUsername: dailyMap.authorUsername,
      });
    } catch (e) {
      console.error('Error getting daily map:', e);
      res.status(500).json({ error: 'Internal server error', message: 'Ошибка сервера' });
    }
  });

  // POST /api/publish — публикация произвольной карты (как было)
  router.post('/publish', (req, res) => {
    try {
      const { password, date, map, authorUsername } = req.body || {};
      const adminPassword = process.env.ADMIN_PASSWORD || 'admin123';

      if (password !== adminPassword) {
        return res.status(403).json({ error: 'Forbidden', message: 'Неверный пароль администратора' });
      }
      if (!date || !map || !authorUsername) {
        return res.status(400).json({
          error: 'Bad request',
          message: 'Необходимы поля: date, map, authorUsername',
        });
      }

      const result = dailyMapManager.publishMap(date, map, authorUsername);
      try { onMapPublished && onMapPublished({ date, map }); } catch {}
      res.json({ success: true, message: 'Карта успешно опубликована', ...result });
    } catch (e) {
      console.error('Error publishing map:', e);
      res.status(500).json({ error: 'Internal server error', message: e.message });
    }
  });

  // 👇 НОВОЕ: POST /api/publish-today — сгенерировать карту на сегодня
  router.post('/publish-today', (req, res) => {
    try {
      const { password, seed, authorUsername } = req.body || {};
      const adminPassword = process.env.ADMIN_PASSWORD || 'admin123';

      if (password !== adminPassword) {
        return res.status(403).json({ error: 'Forbidden', message: 'Неверный пароль администратора' });
      }

      const date = toDateString(new Date());
      const map = generateMap(seed); // если seed не задан — возьмётся внутренний случайный

      const result = dailyMapManager.publishMap(date, map, authorUsername || 'Admin');
      try { onMapPublished && onMapPublished({ date, map }); } catch {}
      res.json({
        success: true,
        message: result.isUpdate ? 'Карта на сегодня обновлена' : 'Карта на сегодня создана',
        mapNumber: result.mapNumber,
        date: result.date,
        isUpdate: result.isUpdate,
      });
    } catch (e) {
      console.error('Error publish-today:', e);
      res.status(500).json({ error: 'Internal server error', message: e.message });
    }
  });

  return router;
}

module.exports = { createApiRouter };
