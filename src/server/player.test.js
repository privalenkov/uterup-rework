const Player = require('./player');
const Constants = require('../shared/constants');

describe('Player', () => {
  test('Player initializes correctly', () => {
    const player = new Player('test-id', 'TestUser', 100, 100);
    
    expect(player.id).toBe('test-id');
    expect(player.username).toBe('TestUser');
    expect(player.x).toBe(100);
    expect(player.y).toBe(100);
    expect(player.jumpCount).toBe(0);
    expect(player.isOnGround).toBe(false);
  });

  test('Player can charge jump', () => {
    const player = new Player('test-id', 'TestUser', 100, 100);
    player.isOnGround = true;
    player.isCharging = true;
    
    player.update(100, { space: true }, []);
    
    expect(player.jumpCharge).toBeGreaterThan(0);
  });

  test('Player serializes correctly', () => {
    const player = new Player('test-id', 'TestUser', 100, 200);
    const serialized = player.serializeForUpdate();
    
    expect(serialized).toHaveProperty('id');
    expect(serialized).toHaveProperty('x');
    expect(serialized).toHaveProperty('y');
    expect(serialized).toHaveProperty('username');
    expect(serialized).toHaveProperty('jumpCount');
  });
});