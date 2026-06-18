const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);

// Fixed: Configured robust CORS parameters to allow local browser connections
const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

// Serve static frontend files if hosted together
app.use(express.static(__dirname));

let players = {};
let currentIt = null;
let tagCooldown = 0;

// Platforms configuration array
const platforms = [
    { x: 0, y: 460, width: 800, height: 40 },
    { x: 120, y: 340, width: 200, height: 15 },
    { x: 480, y: 340, width: 200, height: 15 },
    { x: 300, y: 220, width: 200, height: 15 }
];

io.on('connection', (socket) => {
    console.log(`User connected: ${socket.id}`);

    // Create player structural object properties mapping
    players[socket.id] = {
        id: socket.id,
        x: Math.random() * 600 + 100,
        y: 100,
        width: 30,
        height: 30,
        isIt: false
    };

    // First player inside room context defaults to IT status loop
    if (Object.keys(players).length === 1) {
        players[socket.id].isIt = true;
        currentIt = socket.id;
    }

    // Sync room parameters down to connecting client
    socket.emit('init', { id: socket.id, players, platforms });
    
    // Broadcast arrival data package out to active opponents
    socket.broadcast.emit('newPlayer', players[socket.id]);

    // Handle real-time player position changes
    socket.on('playerMove', (data) => {
        if (players[socket.id]) {
            players[socket.id].x = data.x;
            players[socket.id].y = data.y;
            
            // Broadcast location parameters back out to the swarm
            socket.broadcast.emit('playerUpdated', players[socket.id]);
        }
    });

    // Handle tag verification events safely
    socket.on('tagged', () => {
        if (tagCooldown === 0 && socket.id === currentIt) {
            let targetId = null;
            let p1 = players[socket.id];
            
            for (let id in players) {
                if (id !== socket.id) {
                    let p2 = players[id];
                    let dist = Math.hypot((p1.x - p2.x), (p1.y - p2.y));
                    if (dist < 45) { // Validates proximity checks securely
                        targetId = id;
                        break;
                    }
                }
            }

            if (targetId) {
                players[currentIt].isIt = false;
                players[targetId].isIt = true;
                currentIt = targetId;
                tagCooldown = 60; // 1-second structural cooldown window

                io.emit('tagSwapped', { currentIt, players });
            }
        }
    });

    // Clear connection structures upon unexpected socket closings
    socket.on('disconnect', () => {
        console.log(`User disconnected: ${socket.id}`);
        const wasIt = players[socket.id]?.isIt;
        delete players[socket.id];

        // Hand over the torch if the player who is "It" leaves the match prematurely
        if (wasIt && Object.keys(players).length > 0) {
            currentIt = Object.keys(players)[0];
            players[currentIt].isIt = true;
            io.emit('tagSwapped', { currentIt, players });
        }

        io.emit('playerDisconnected', socket.id);
    });
});

// Structural ticking calculation looping mechanics
setInterval(() => {
    if (tagCooldown > 0) tagCooldown--;
}, 1000 / 60);

const PORT = 3000;
server.listen(PORT, () => console.log(`Server running smoothly on http://localhost:${PORT}`));
