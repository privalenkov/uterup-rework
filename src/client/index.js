import { connect, play } from './networking';
import { startRendering, stopRendering } from './render';
import { startCapturingInput, stopCapturingInput } from './input';
import { initState } from './state';
import { setLeaderboardHidden } from './leaderboard';
import './css/main.css';

const playMenu = document.getElementById('play-menu');
const playButton = document.getElementById('play-button');
const usernameInput = document.getElementById('username-input');
const lobbyInfo = document.getElementById('lobby-info');

// Создаем элемент для отображения информации о лобби
if (!lobbyInfo) {
  const lobbyInfoDiv = document.createElement('div');
  lobbyInfoDiv.id = 'lobby-info';
  lobbyInfoDiv.className = 'lobby-info hidden';
  document.body.appendChild(lobbyInfoDiv);
}

Promise.all([
  connect(),
]).then(() => {
  playMenu.classList.remove('hidden');
  usernameInput.focus();
  
  playButton.onclick = () => {
    const username = usernameInput.value.trim() || 'Anonymous';
    
    playButton.disabled = true;
    playButton.textContent = 'Joining...';
    
    play(username);
    playMenu.classList.add('hidden');
    initState();
    startCapturingInput();
    startRendering();
    setLeaderboardHidden(false);
  };

  usernameInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
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