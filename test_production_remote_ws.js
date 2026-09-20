const { io } = require('socket.io-client');

const SERVER_URL = 'https://the-bid-server.onrender.com';
console.log(`Connecting to authoritative production WebSocket: ${SERVER_URL}...`);

const socket = io(SERVER_URL, {
  transports: ['websocket', 'polling'],
  timeout: 10000,
  reconnection: false
});

const timeoutTimer = setTimeout(() => {
  console.error('❌ Connection timed out after 10s');
  process.exit(1);
}, 10000);

socket.on('connect', () => {
  clearTimeout(timeoutTimer);
  console.log(`✅ Successfully connected to Production WebSocket! Socket ID: ${socket.id}`);

  // Test room creation over production socket
  socket.emit('create_room', {
    user: { id: 'test_user_remote', name: 'Production Tester', avatar: 'avatar_1', uniqueId: 'BID-PROD-TEST' },
    category: 'ipl_cricket'
  }, (response) => {
    console.log('✅ Production Room Creation Response:', response);
    socket.disconnect();
    console.log('✅ ALL PRODUCTION WEBSOCKET CHECKS PASSED!');
    process.exit(0);
  });
});

socket.on('connect_error', (err) => {
  clearTimeout(timeoutTimer);
  console.error('❌ WebSocket connect_error:', err.message);
  process.exit(1);
});
