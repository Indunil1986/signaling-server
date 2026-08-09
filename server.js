// ============================================================
// SIGNALING SERVER
// This does NOT carry video. It only helps two phones find each
// other (using a room code) and exchange the connection info
// needed to start a direct WebRTC video stream between them.
// ============================================================

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);

// Allow connections from any device on your network (phones, browser)
const io = new Server(server, {
  cors: {
    origin: '*',
  },
});

// Keeps track of which room codes are active and who is in them
// Example: rooms['482913'] = { camera: 'socketId123', viewer: 'socketId456' }
const rooms = {};

app.get('/', (req, res) => {
  res.send('Signaling server is running.');
});

io.on('connection', (socket) => {
  console.log('Device connected:', socket.id);

  // Camera phone calls this when it starts streaming
  socket.on('start-camera', (roomCode) => {
    rooms[roomCode] = rooms[roomCode] || {};
    rooms[roomCode].camera = socket.id;
    socket.join(roomCode);
    console.log(`Camera started room ${roomCode}`);
  });

  // Viewer phone calls this when it wants to watch a camera
  socket.on('join-viewer', (roomCode) => {
    if (!rooms[roomCode] || !rooms[roomCode].camera) {
      socket.emit('room-not-found');
      return;
    }
    rooms[roomCode].viewer = socket.id;
    socket.join(roomCode);
    console.log(`Viewer joined room ${roomCode}`);

    // Tell the camera a viewer has joined, so it can start the WebRTC handshake
    io.to(rooms[roomCode].camera).emit('viewer-joined');
  });

  // Relay WebRTC connection info between camera and viewer
  // (Both sides send these automatically - you won't need to trigger them yourself)
  socket.on('webrtc-offer', ({ roomCode, offer }) => {
    const viewerId = rooms[roomCode]?.viewer;
    if (viewerId) io.to(viewerId).emit('webrtc-offer', offer);
  });

  socket.on('webrtc-answer', ({ roomCode, answer }) => {
    const cameraId = rooms[roomCode]?.camera;
    if (cameraId) io.to(cameraId).emit('webrtc-answer', answer);
  });

  socket.on('ice-candidate', ({ roomCode, candidate, from }) => {
    const targetId = from === 'camera' ? rooms[roomCode]?.viewer : rooms[roomCode]?.camera;
    if (targetId) io.to(targetId).emit('ice-candidate', candidate);
  });

  socket.on('disconnect', () => {
    console.log('Device disconnected:', socket.id);
    // Clean up any room this socket was part of
    for (const code in rooms) {
      if (rooms[code].camera === socket.id) delete rooms[code].camera;
      if (rooms[code].viewer === socket.id) delete rooms[code].viewer;
      if (!rooms[code].camera && !rooms[code].viewer) delete rooms[code];
    }
  });
});

const PORT = 3000;
server.listen(PORT, () => {
  console.log(`Signaling server running on port ${PORT}`);
  console.log(`On your phone/app, connect to: http://YOUR-COMPUTER-IP:${PORT}`);
});
