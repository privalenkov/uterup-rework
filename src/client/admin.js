// src/client/admin.js
import './css/main.css';

function $(sel) { return document.querySelector(sel); }

function setStatus(text, isError = false) {
  const el = $('#status');
  el.textContent = text;
  el.className = isError ? 'status error' : 'status ok';
}

async function publishToday(password) {
  const body = { password }; // можно добавить { seed, authorUsername } при желании
  const resp = await fetch('/api/publish-today', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    const msg = data?.message || data?.error || `HTTP ${resp.status}`;
    throw new Error(msg);
  }
  return data;
}

window.addEventListener('DOMContentLoaded', () => {
  const form = $('#publish-form');
  const passwordInput = $('#password');
  const btn = $('#generateBtn');

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const password = passwordInput.value.trim();
    if (!password) {
      setStatus('Введите пароль', true);
      return;
    }

    btn.disabled = true;
    setStatus('Генерация карты...');

    try {
      const result = await publishToday(password);
      const label = result.isUpdate ? 'обновлена' : 'создана';
      setStatus(`Карта #${result.mapNumber} на ${result.date} ${label} ✅`);
    } catch (err) {
      setStatus(`Ошибка: ${err.message}`, true);
    } finally {
      btn.disabled = false;
      passwordInput.value = '';
    }
  });
});
