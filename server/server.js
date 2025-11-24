// server/server.js

const express = require("express");
const http = require("http");
const cors = require("cors");
const { Server } = require("socket.io");

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// --- SOCKET.IO ---
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    },
    transports: ['websocket', 'polling'],
    allowEIO3: true
});

// Stockage des connexions actives
let connectionsActives = 0;
let dernierePositionBus = null;
let historiquePositions = [];

// ============================================
// ROUTES HTTP (AVANT SOCKET.IO)
// ============================================

// Route principale
app.get("/", (req, res) => {
    res.json({
        status: "✅ OK",
        service: "Serveur Bisannou",
        socketio: "actif",
        connexions: connectionsActives,
        dernierePosition: dernierePositionBus,
        historiqueCount: historiquePositions.length,
        timestamp: new Date().toISOString(),
        uptime: Math.floor(process.uptime()) + " secondes"
    });
});

// Route de santé pour Render
app.get("/health", (req, res) => {
    res.status(200).json({ 
        status: "healthy",
        uptime: process.uptime(),
        connexions: connectionsActives,
        memory: process.memoryUsage()
    });
});

// Route pour voir l'historique
app.get("/historique", (req, res) => {
    res.json({
        positions: historiquePositions,
        count: historiquePositions.length
    });
});

// Route pour tester l'émission manuelle
app.post("/test-emit", (req, res) => {
    const testData = {
        lat: 16.265,
        lng: -61.551,
        busId: "TEST_BUS",
        timestamp: Date.now()
    };
    
    console.log("🧪 TEST MANUEL - Émission de position test");
    io.emit("bus:position", testData);
    
    res.json({ 
        message: "Position test émise",
        data: testData,
        clients: connectionsActives
    });
});

// Route de test de connexion Socket.IO
app.get("/socket-test", (req, res) => {
    res.send(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>Test Socket.IO Bisannou</title>
            <meta charset="utf-8">
            <style>
                body { font-family: monospace; padding: 20px; background: #1e1e1e; color: #00ff00; }
                #logs { white-space: pre-wrap; }
                .success { color: #00ff00; }
                .error { color: #ff0000; }
                .info { color: #00aaff; }
            </style>
        </head>
        <body>
            <h1>🚌 Test Socket.IO Bisannou</h1>
            <button onclick="testerEmission()">Émettre position test</button>
            <hr>
            <div id="logs"></div>
            
            <script src="https://cdn.socket.io/4.7.2/socket.io.min.js"></script>
            <script>
                const logs = document.getElementById('logs');
                
                function log(msg, type = 'info') {
                    const time = new Date().toLocaleTimeString();
                    logs.innerHTML += '<span class="' + type + '">[' + time + '] ' + msg + '</span>\\n';
                }
                
                log('Connexion au serveur...', 'info');
                
                const socket = io({
                    transports: ['websocket', 'polling']
                });
                
                socket.on('connect', () => {
                    log('✅ Connecté ! Socket ID: ' + socket.id, 'success');
                });
                
                socket.on('connect_error', (err) => {
                    log('❌ Erreur: ' + err.message, 'error');
                });
                
                socket.on('bus:position', (data) => {
                    log('📍 Position reçue: ' + JSON.stringify(data), 'success');
                });
                
                function testerEmission() {
                    const pos = {
                        lat: 16.265 + (Math.random() - 0.5) * 0.01,
                        lng: -61.551 + (Math.random() - 0.5) * 0.01,
                        busId: 'TEST_WEB',
                        timestamp: Date.now()
                    };
                    socket.emit('bus:position', pos);
                    log('🚀 Position émise: ' + JSON.stringify(pos), 'info');
                }
            </script>
        </body>
        </html>
    `);
});

// ============================================
// SOCKET.IO
// ============================================

io.on("connection", (socket) => {
    connectionsActives++;
    console.log("\n==============================================");
    console.log("✅ NOUVELLE CONNEXION");
    console.log("Socket ID:", socket.id);
    console.log("Transport:", socket.conn.transport.name);
    console.log("Connexions actives:", connectionsActives);
    console.log("Heure:", new Date().toISOString());
    console.log("==============================================\n");

    // Envoyer la dernière position connue au nouveau client
    if (dernierePositionBus) {
        console.log("📤 Envoi dernière position au nouveau client");
        socket.emit("bus:position", dernierePositionBus);
    }

    // Le bus envoie sa position
    socket.on("bus:position", (data) => {
        const timestamp = new Date().toISOString();
        console.log("\n🚌 ========== POSITION BUS REÇUE ==========");
        console.log("Heure:     ", timestamp);
        console.log("Socket ID: ", socket.id);
        console.log("Latitude:  ", data.lat);
        console.log("Longitude: ", data.lng);
        console.log("Bus ID:    ", data.busId);
        console.log("Data:      ", JSON.stringify(data));
        console.log("==========================================\n");
        
        // Sauvegarder la dernière position
        dernierePositionBus = {
            ...data,
            receivedAt: timestamp
        };
        
        // Ajouter à l'historique (garder max 100 positions)
        historiquePositions.push(dernierePositionBus);
        if (historiquePositions.length > 100) {
            historiquePositions.shift();
        }
        
        // Broadcaster à tous les clients
        io.emit("bus:position", data);
        console.log("📡 Position diffusée à", connectionsActives, "client(s)");
    });

    socket.on("disconnect", (reason) => {
        connectionsActives--;
        console.log("\n❌ ========== DÉCONNEXION ==========");
        console.log("Socket ID: ", socket.id);
        console.log("Raison:    ", reason);
        console.log("Actifs:    ", connectionsActives);
        console.log("Heure:     ", new Date().toISOString());
        console.log("====================================\n");
    });

    socket.on("error", (error) => {
        console.error("❌ ERREUR SOCKET:", socket.id, error);
    });
});

// ============================================
// DÉMARRAGE SERVEUR
// ============================================

const PORT = process.env.PORT || 3000;

server.listen(PORT, () => {
    console.log("\n");
    console.log("🚀 =======================================");
    console.log("🚀 SERVEUR BISANNOU DÉMARRÉ");
    console.log("🚀 =======================================");
    console.log("🚀 Port:        ", PORT);
    console.log("🚀 Environnement:", process.env.NODE_ENV || "development");
    console.log("🚀 Date:        ", new Date().toISOString());
    console.log("🚀 Node version:", process.version);
    console.log("🚀 =======================================");
    console.log("\n📋 Routes disponibles:");
    console.log("   GET  /              - Statut du serveur");
    console.log("   GET  /health        - Santé du serveur");
    console.log("   GET  /historique    - Historique positions");
    console.log("   GET  /socket-test   - Page de test Socket.IO");
    console.log("   POST /test-emit     - Émettre position test");
    console.log("\n");
});