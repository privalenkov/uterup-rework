import io from 'socket.io-client';
import { processGameUpdate } from './state';
import { showLobbyInfo, updateLobbyInfo } from './index';
const Constants = require('../shared/constants');

const isDevelopment = process.env.NODE_ENV === 'development';

const socket = io(isDevelopment ? `ws://${window.location.host}` : `wss://${window.location.host}`);
const connectedPromise = new Promise(resolve => {
  socket.on('connect', () => {
    console.log('Connected to server!');
    resolve();
  });
});

export const connect = () => (
  connectedPromise.then(() => {
    socket.on(Constants.MSG_TYPES.GAME_UPDATE, processGameUpdate);
    
    socket.on('lobby_joined', (data) => {
      console.log('Joined lobby:', data);
      showLobbyInfo(data);
    });
    
    socket.on('lobby_update', (data) => {
      console.log('Lobby updated:', data);
      updateLobbyInfo(data);
    });
    
    socket.on('join_failed', (data) => {
      alert(`Failed to join: ${data.reason}`);
      window.location.reload();
    });
    
    socket.on('server_full', () => {
      alert('All lobbies are full! Please try again later.');
      window.location.reload();
    });
  })
);

export const play = username => {
  socket.emit(Constants.MSG_TYPES.JOIN_GAME, username);
};

export const updateInput = input => {
  socket.emit(Constants.MSG_TYPES.INPUT, input);
};