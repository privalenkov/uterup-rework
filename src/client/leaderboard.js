const Constants = require('../shared/constants');

const leaderboard = document.getElementById('leaderboard');
const rows = document.querySelectorAll('#leaderboard table tr');

export function updateLeaderboard(data) {
  for (let i = 0; i < data.length && i < rows.length; i++) {
    const row = rows[i];
    row.children[0].textContent = i + 1;
    row.children[1].textContent = data[i].username;
    row.children[2].textContent = data[i].jumps;
  }

  for (let i = data.length; i < rows.length; i++) {
    rows[i].children[0].textContent = i + 1;
    rows[i].children[1].textContent = '-';
    rows[i].children[2].textContent = '-';
  }
}

export function setLeaderboardHidden(hidden) {
  if (hidden) {
    leaderboard.classList.add('hidden');
  } else {
    leaderboard.classList.remove('hidden');
  }
}