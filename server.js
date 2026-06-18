const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: { origin: "*" }
});

// Serve the frontend files
app.use(express.static(__dirname));

let players = {};
let currentIt = null;
let tagCooldown = 0;

// Platforms layout data to calculate collisions on client side securely
const platforms = [
    { x: 0, y: 460, width: 800, height: 40 },
    { x: 120, y: 340, width: 200, height: 15 },
    { x: 480, y: 340, width: 200, height: 15 },
    { x: 300, y: 220, width: 200, height: 15 }
];

io.on('connection', (socket) => {
    console.log(`User connected: ${socket.id}`);

    // Create a new player entry upon joining
    players[socket.id] = {
        id: socket.id,
        x: Math.random() * 600 + 100,
        y: 100,
        width: 30,
        height: 30,
        isIt: false
    };

    // First player to join becomes "It"
    if (Object.keys(players).length === 1) {
        players[socket.id].isIt = true;
        currentIt = socket.id;
    }

    // Send existing room conditions to the newly connected user
    socket.emit('init', { id: socket.id, players, platforms });
    
    // Broadcast the new player arrival to everyone else
    socket.broadcast.emit('newPlayer', players[socket.id]);

    // Handle incoming position streams from clients
    socket.on('playerMove', (data) => {
        if (players[socket.id]) {
            players[socket.id].x = data.x;
            players[socket.id].y = data.y;
            
            // Broadcast movement updates to everyone else instantly
            socket.broadcast.emit('playerUpdated', players[socket.id]);
        }
    });

    // Handle tag event signals sent by players
    socket.on('tagged', () => {
        if (tagCooldown === 0 && socket.id === currentIt) {
            // Find the closest non-it player to confirm tag validity
            let targetId = null;
            let p1 = players[socket.id];
            
            for (let id in players) {
                if (id !== socket.id) {
                    let p2 = players[id];
                    // Basic distance calculation
                    let dist = Math.hypot((p1.x - p2.x), (p1.y - p2.y));
                    if (dist < 45) { // Close enough to register tag safely
                        targetId = id;
                        break;
                    }
                }
            }

            if (targetId) {
                players[currentIt].isIt = false;
                players[targetId].isIt = true;
                currentIt = targetId;
                tagCooldown = 60; // 1 second cooldown buffer

                io.emit('tagSwapped', { currentIt, players });
            }
        }
    });

    // Clear memory states when someone quits
    socket.on('disconnect', () => {
        console.log(`User disconnected: ${socket.id}`);
        const wasIt = players[socket.id]?.isIt;
        delete players[socket.id];

        // Pass "It" flag to someone else if the tagged player leaves
        if (wasIt && Object.keys(players).length > 0) {
            currentIt = Object.keys(players)[0];
            players[currentIt].isIt = true;
            io.emit('tagSwapped', { currentIt, players });
        }

        io.emit('playerDisconnected', socket.id);
    });
});

// Cooldown ticking loop
setInterval(() => {
    if (tagCooldown > 0) tagCooldown--;
}, 1000 / 60);

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server executing successfully on port ${PORT}`));
