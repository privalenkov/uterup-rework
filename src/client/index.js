import { connect, play } from './networking';
import { startRendering, stopRendering } from './render';
import { startCapturingInput, stopCapturingInput } from './input';
import { initState, setMap } from './state';
import { setLeaderboardHidden } from './leaderboard';
import './css/main.css';

const playMenu = document.getElementById('play-menu');
const playButton = document.getElementById('play-button');
const usernameInput = document.getElementById('username-input');
const lobbyInfo = document.getElementById('lobby-info');
const mapInfo = document.getElementById('map-info');
const errorMessage = document.getElementById('error-message');

// Создаем элемент для отображения информации о лобби
if (!lobbyInfo) {
  const lobbyInfoDiv = document.createElement('div');
  lobbyInfoDiv.id = 'lobby-info';
  lobbyInfoDiv.className = 'lobby-info hidden';
  document.body.appendChild(lobbyInfoDiv);
}

let dailyMapData = null;

// Загружаем информацию о карте дня
async function loadDailyMap() {
  try {
    const response = await fetch('/api/daily');
    
    if (!response.ok) {
      if (response.status === 404) {
        throw new Error('Карта на сегодня не опубликована');
      }
      throw new Error('Ошибка загрузки карты');
    }

    dailyMapData = await response.json();
    
    // Отображаем информацию о карте
    if (mapInfo) {
      mapInfo.innerHTML = `
        <div class="map-number">Карта #${dailyMapData.mapNumber}</div>
        <div class="map-author">Автор: ${dailyMapData.authorUsername}</div>
        ${dailyMapData.averageJumps ? `<div class="map-average">Средний результат: ${dailyMapData.averageJumps} прыжков</div>` : ''}
      `;
    }

    // Обновляем текст кнопки
    playButton.textContent = `Играть карту #${dailyMapData.mapNumber}`;
    playButton.disabled = false;

    if (errorMessage) {
      errorMessage.classList.add('hidden');
    }

    return true;
  } catch (error) {
    console.error('Error loading daily map:', error);
    
    // Отображаем ошибку
    if (errorMessage) {
      errorMessage.textContent = error.message;
      errorMessage.classList.remove('hidden');
    }

    playButton.textContent = 'Ошибка';
    playButton.disabled = true;

    return false;
  }
}

// Инициализация при загрузке страницы
Promise.all([
  connect(),
  loadDailyMap()
]).then(([_, mapLoaded]) => {
  playMenu.classList.remove('hidden');
  
  if (mapLoaded) {
    usernameInput.focus();
  }
  
  playButton.onclick = () => {
    if (!dailyMapData) {
      alert('Карта не загружена!');
      return;
    }

    const username = usernameInput.value.trim() || 'Anonymous';
    
    playButton.disabled = true;
    playButton.textContent = 'Подключение...';
    
    // ВАЖНО: Сначала инициализируем state
    initState();
    
    // Потом устанавливаем карту
    setMap(dailyMapData.map);
    
    console.log('Map set, starting game...');
    console.log('Map size:', dailyMapData.map.length, 'x', dailyMapData.map[0].length);
    
    play(username);
    playMenu.classList.add('hidden');
    startCapturingInput();
    startRendering();
    setLeaderboardHidden(false);
  };

  usernameInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter' && !playButton.disabled) {
      playButton.click();
    }
  });
});

// Показываем информацию о лобби
export function showLobbyInfo(lobbyData) {
  const lobbyInfoDiv = document.getElementById('lobby-info');
  if (lobbyInfoDiv) {
    lobbyInfoDiv.innerHTML = `
      <div class="lobby-badge">
        🏠 Lobby: ${lobbyData.lobbyId}<br>
        👥 Players: ${lobbyData.players}/${lobbyData.maxPlayers}
      </div>
    `;
    lobbyInfoDiv.classList.remove('hidden');
  }
}

export function updateLobbyInfo(lobbyData) {
  const lobbyInfoDiv = document.getElementById('lobby-info');
  if (lobbyInfoDiv && !lobbyInfoDiv.classList.contains('hidden')) {
    lobbyInfoDiv.innerHTML = `
      <div class="lobby-badge">
        🏠 Lobby: ${lobbyData.id}<br>
        👥 Players: ${lobbyData.players}/${lobbyData.maxPlayers}
      </div>
    `;
  }
}