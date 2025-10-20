import { updateInput } from './networking';

let currentInput = {
  left: false,
  right: false,
  space: false
};

function onKeyDown(e) {
  if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') {
    currentInput.left = true;
  }
  if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') {
    currentInput.right = true;
  }
  if (e.key === ' ' || e.key === 'Spacebar') {
    currentInput.space = true;
    e.preventDefault();
  }
  sendInput();
}

function onKeyUp(e) {
  if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') {
    currentInput.left = false;
  }
  if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') {
    currentInput.right = false;
  }
  if (e.key === ' ' || e.key === 'Spacebar') {
    currentInput.space = false;
  }
  sendInput();
}

function sendInput() {
  updateInput(currentInput);
}

export function startCapturingInput() {
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
}

export function stopCapturingInput() {
  window.removeEventListener('keydown', onKeyDown);
  window.removeEventListener('keyup', onKeyUp);
}