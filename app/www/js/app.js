// --- CONFIG SERVEUR RENDER ---
const SERVER_URL = "https://poc-bus-server.onrender.com";

// --- VARIABLES ---
let map;
let socket;
let gpsInterval = null;
let mode = null;
let appReady = false;

let busMarker = null;
let stopMarker = null;
let stopPosition = null;
let busNearNotified = false;

// ---------------------------------------------------------
// INITIALISATION DE LA CARTE
// ---------------------------------------------------------
function initMap() {
    // Position initiale : Guadeloupe
    map = L.map("map").setView([16.265, -61.551], 13);

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: "© OpenStreetMap",
        maxZoom: 19
    }).addTo(map);
}

// ---------------------------------------------------------
// SOCKET.IO AVEC TON SERVEUR RENDER
// ---------------------------------------------------------
function initSocket() {
    console.log("Tentative de connexion à:", SERVER_URL);
    
    socket = io(SERVER_URL, {
        transports: ["websocket", "polling"],
        forceNew: true,
        reconnection: true,
        reconnectionAttempts: 5
    });

    socket.on("connect", () => {
        console.log("✅ Socket connecté :", socket.id);
        setStatus("Connecté au serveur ✓ " + socket.id);
        alert("Connecté au serveur ! ID: " + socket.id);
    });

    socket.on("disconnect", () => {
        console.log("❌ Socket déconnecté");
        setStatus("Déconnecté du serveur ✗");
    });

    socket.on("connect_error", (err) => {
        console.error("❌ Erreur Socket.IO :", err);
        setStatus("Erreur de connexion au serveur");
        alert("Erreur connexion: " + err.message);
    });

    socket.on("bus:position", (data) => {
        afficherBus(data);
        verifierProximite(data);
    });
}

// ---------------------------------------------------------
// UTILITAIRE
// ---------------------------------------------------------
function setStatus(txt) {
    document.getElementById("status").textContent = txt;
}

// ---------------------------------------------------------
// MODE BUS : ENVOI GPS TOUTES LES 5 SECONDES
// ---------------------------------------------------------
function activerModeBus() {
    if (!appReady) {
        alert("Application pas encore prête, patientez...");
        return;
    }

    console.log("\n========================================");
    console.log("🚌 ACTIVATION MODE BUS");
    console.log("========================================");

    mode = "bus";
    busNearNotified = false;
    
    // Arrêter le mode carte cliquable
    map.off("click");
    
    // Supprimer le marqueur d'arrêt si existant
    if (stopMarker) {
        map.removeLayer(stopMarker);
        stopMarker = null;
        stopPosition = null;
    }

    // Arrêter l'intervalle précédent s'il existe
    if (gpsInterval) {
        console.log("⏹️ Arrêt de l'intervalle précédent");
        clearInterval(gpsInterval);
        gpsInterval = null;
    }

    setStatus("Mode BUS : envoi GPS actif...");

    let compteurEnvois = 0;

    // Fonction d'envoi GPS
    function envoyerPosition() {
        compteurEnvois++;
        console.log(`\n--- 📡 ENVOI #${compteurEnvois} ---`);
        console.log("Heure:", new Date().toLocaleTimeString());
        console.log("🔍 Tentative d'obtention GPS...");
        
        // Vérifier si navigator.geolocation existe
        if (!navigator.geolocation) {
            const msg = "❌ Géolocalisation non supportée par ce navigateur";
            console.error(msg);
            alert(msg);
            setStatus(msg);
            return;
        }
        
        navigator.geolocation.getCurrentPosition(
            (pos) => {
                const lat = pos.coords.latitude;
                const lng = pos.coords.longitude;

                console.log("✅ Position GPS obtenue:", lat, lng);
                console.log("   Précision:", pos.coords.accuracy, "mètres");
                console.log("🚀 Envoi au serveur...");

                // Afficher le bus sur la carte
                afficherBus({ lat, lng });

                // Centrer la carte sur la position actuelle
                map.setView([lat, lng], 15);

                // Envoyer au serveur
                const payload = {
                    lat,
                    lng,
                    busId: "BUS_1",
                    timestamp: Date.now()
                };
                
                console.log("📦 Payload:", JSON.stringify(payload));
                console.log("🔌 Socket connecté?", socket.connected);
                console.log("🆔 Socket ID:", socket.id);
                
                if (!socket.connected) {
                    const msg = "❌ Socket déconnecté ! Impossible d'envoyer.";
                    console.error(msg);
                    alert(msg);
                    setStatus(msg);
                    return;
                }
                
                socket.emit("bus:position", payload);
                console.log("✅ Émission bus:position envoyée avec succès");
                console.log(`📊 Total envois réussis: ${compteurEnvois}`);

                setStatus(`✅ Envoi #${compteurEnvois} - Position: ${lat.toFixed(4)}, ${lng.toFixed(4)}`);
            },
            (err) => {
                console.error("❌ ERREUR GPS:");
                console.error("   Code:", err.code);
                console.error("   Message:", err.message);
                
                let msgErreur = "Erreur GPS: ";
                switch(err.code) {
                    case 1:
                        msgErreur += "Permission refusée. Autorisez la localisation dans les paramètres.";
                        break;
                    case 2:
                        msgErreur += "Position indisponible. Êtes-vous à l'intérieur ?";
                        break;
                    case 3:
                        msgErreur += "Timeout. Réessayez.";
                        break;
                    default:
                        msgErreur += err.message;
                }
                
                console.error(msgErreur);
                alert(msgErreur);
                setStatus(msgErreur);
            },
            {
                enableHighAccuracy: true,
                timeout: 15000,
                maximumAge: 0
            }
        );
    }

    // Première position immédiate
    console.log("🚀 Premier envoi GPS immédiat...");
    envoyerPosition();

    // Puis toutes les 5 secondes
    console.log("⏰ Démarrage intervalle : envoi toutes les 5 secondes");
    gpsInterval = setInterval(envoyerPosition, 5000);
    
    console.log("✅ Mode BUS activé avec succès");
    console.log("========================================\n");
}

// ---------------------------------------------------------
// MODE ARRÊT : CHOIX D'UN POINT SUR LA CARTE
// ---------------------------------------------------------
function activerModeArret() {
    if (!appReady) {
        alert("Application pas encore prête, patientez...");
        return;
    }

    mode = "arret";
    busNearNotified = false;

    // Arrêter l'envoi GPS
    if (gpsInterval) {
        clearInterval(gpsInterval);
        gpsInterval = null;
    }

    setStatus("Mode ARRÊT : touchez la carte pour placer votre arrêt.");

    // Activer le clic sur la carte
    map.off("click");
    map.on("click", (e) => {
        stopPosition = e.latlng;

        // Créer ou déplacer le marqueur d'arrêt
        if (!stopMarker) {
            stopMarker = L.marker(e.latlng, {
                title: "Votre arrêt",
                icon: L.icon({
                    iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-red.png',
                    shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png',
                    iconSize: [25, 41],
                    iconAnchor: [12, 41],
                    popupAnchor: [1, -34],
                    shadowSize: [41, 41]
                })
            }).addTo(map);
        } else {
            stopMarker.setLatLng(e.latlng);
        }

        setStatus(`Arrêt placé à ${e.latlng.lat.toFixed(4)}, ${e.latlng.lng.toFixed(4)}. En attente du bus...`);
    });
}

// ---------------------------------------------------------
// AFFICHAGE DU BUS SUR LA CARTE
// ---------------------------------------------------------
function afficherBus(data) {
    if (!busMarker) {
        busMarker = L.marker([data.lat, data.lng], {
            title: "Bus en circulation",
            icon: L.icon({
                iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-blue.png',
                shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png',
                iconSize: [25, 41],
                iconAnchor: [12, 41],
                popupAnchor: [1, -34],
                shadowSize: [41, 41]
            })
        }).addTo(map);
        busMarker.bindPopup("Bus en circulation");
    } else {
        busMarker.setLatLng([data.lat, data.lng]);
    }
}

// ---------------------------------------------------------
// CALCUL DISTANCE (MÈTRES)
// ---------------------------------------------------------
function distanceMeters(lat1, lon1, lat2, lon2) {
    const R = 6371000; // Rayon de la Terre en mètres
    const toRad = (x) => x * Math.PI / 180;

    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);

    const a =
        Math.sin(dLat / 2) ** 2 +
        Math.cos(toRad(lat1)) *
        Math.cos(toRad(lat2)) *
        Math.sin(dLon / 2) ** 2;

    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ---------------------------------------------------------
// NOTIFICATION SI LE BUS APPROCHE
// ---------------------------------------------------------
function verifierProximite(bus) {
    if (mode !== "arret") return;
    if (!stopPosition) return;

    const d = distanceMeters(
        stopPosition.lat,
        stopPosition.lng,
        bus.lat,
        bus.lng
    );

    console.log("Distance bus/arrêt :", Math.round(d), "mètres");

    // Si le bus est à moins de 200m et qu'on n'a pas encore notifié
    if (d <= 200 && !busNearNotified) {
        busNearNotified = true;

        const message = `Le bus arrive ! Distance: ${Math.round(d)}m`;

        // Notification native Cordova
        if (window.cordova && cordova.plugins && cordova.plugins.notification) {
            cordova.plugins.notification.local.schedule({
                title: "🚌 Bus Bisannou",
                text: message,
                foreground: true,
                vibrate: true,
                sound: true
            });
        }

        // Alerte web en fallback
        alert(message);

        // Mettre à jour le statut
        setStatus(message);
    }
}

// ---------------------------------------------------------
// DEMANDER LA PERMISSION DE LOCALISATION
// ---------------------------------------------------------
function demanderPermissionGPS() {
    navigator.geolocation.getCurrentPosition(
        () => {
            console.log("Permission GPS accordée");
        },
        (err) => {
            console.warn("Permission GPS refusée:", err);
            alert("L'application a besoin de votre localisation pour fonctionner.");
        },
        { enableHighAccuracy: true }
    );
}

// ---------------------------------------------------------
// CORDOVA READY
// ---------------------------------------------------------
document.addEventListener("deviceready", () => {
    console.log("Cordova ready!");

    initMap();
    initSocket();

    // Demander les permissions
    demanderPermissionGPS();

    if (window.cordova && cordova.plugins && cordova.plugins.notification) {
        cordova.plugins.notification.local.requestPermission((granted) => {
            console.log("Permission notifications:", granted);
        });
    }

    appReady = true;
    setStatus("Application prête ! Choisissez un mode.");
}, false);

// ---------------------------------------------------------
// FALLBACK POUR TESTS EN NAVIGATEUR WEB
// ---------------------------------------------------------
if (typeof cordova === 'undefined') {
    console.warn("Cordova non détecté - Mode web");
    setTimeout(() => {
        initMap();
        initSocket();
        appReady = true;
        setStatus("Mode web - Application prête !");
    }, 500);
}