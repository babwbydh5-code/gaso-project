// Firebase Setup
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import {
    getAuth,
    createUserWithEmailAndPassword,
    signInWithEmailAndPassword,
    onAuthStateChanged,
    signOut,
    updateProfile,
    setPersistence,
    browserLocalPersistence,
    browserSessionPersistence,
    GoogleAuthProvider,
    signInWithPopup,
    signInWithRedirect,
    getRedirectResult
} from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";
import { getMessaging, getToken, onMessage } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-messaging.js";
import {
    getDatabase,
    ref,
    push,
    onValue,
    remove,
    update,
    set,
    serverTimestamp 
} from "https://www.gstatic.com/firebasejs/10.8.1/firebase-database.js";

const firebaseConfig = {
    apiKey: "AIzaSyBHUsLto4xvHn01F8aA_wnNx8MfDfpaY-w",
    authDomain: "gas-sudan-81ecc.firebaseapp.com",
    projectId: "gas-sudan-81ecc",
    storageBucket: "gas-sudan-81ecc.firebasestorage.app",
    messagingSenderId: "124782250398",
    appId: "1:124782250398:web:89eb5d87fb6ff57b706e8f",
    measurementId: "G-MW0YMLDFHW",
    databaseURL: "https://gas-sudan-81ecc-default-rtdb.firebaseio.com/"
};

let app, auth, messaging, db;
let currentUser = null;
let gasStations = [];
let selectedLocation = null;
let tempMarker = null;
let fcmRegistration = null;
let markersMap = new Map(); // Store Leaflet markers by station ID for efficient updates

try {
    // Initializing Firebase with real credentials
    app = initializeApp(firebaseConfig);
    auth = getAuth(app);

    window.auth =auth;
    // Setting persistence to LOCAL (persists even when browser is closed)
    setPersistence(auth, browserSessionPersistence)
        .then(() => console.log("Auth persistence set to LOCAL"))
        .catch(err => console.error("Error setting persistence:", err));

    messaging = getMessaging(app);
    db = getDatabase(app);
} catch (error) {
    console.error("Firebase initialization error:", error);
}

const GAS_COMPANIES = [
    "Bashayer", "Al-Neel", "Aman", "White Nile", "Al-Jazeera",
    "Darfur Gas", "Kordofan Gas", "Al-Noor", "Al-Tahadi",
    "Al-Mustaqbal", "Al-Safwa", "Al-Ruwad", "Al-Nokhba",
    "Al-Amal", "Al-Salam", "National Gas", "Global Gas", "Local"
];

const translations = {
    'available': { en: 'Available', ar: 'متوفر' },
    'low': { en: 'Low', ar: 'قليل' },
    'out': { en: 'Out', ar: 'نفذ' },
    'Bashayer': { en: 'Bashayer', ar: 'بشاير' },
    'Al-Neel': { en: 'Al-Neel', ar: 'النيل' },
    'Aman': { en: 'Aman', ar: 'أمان' },
    'White Nile': { en: 'White Nile', ar: 'النيل الأبيض' },
    'Al-Jazeera': { en: 'Al-Jazeera', ar: 'الجزيرة' },
    'Darfur Gas': { en: 'Darfur Gas', ar: 'غاز دارفور' },
    'Kordofan Gas': { en: 'Kordofan Gas', ar: 'غاز كردفان' },
    'Al-Noor': { en: 'Al-Noor', ar: 'النور' },
    'Al-Tahadi': { en: 'Al-Tahadi', ar: 'التحدي' },
    'Al-Mustaqbal': { en: 'Al-Mustaqbal', ar: 'المستقبل' },
    'Al-Safwa': { en: 'Al-Safwa', ar: 'الصفوة' },
    'Al-Ruwad': { en: 'Al-Ruwad', ar: 'الرواد' },
    'Al-Nokhba': { en: 'Al-Nokhba', ar: 'النخبة' },
    'Al-Amal': { en: 'Al-Amal', ar: 'الأمل' },
    'Al-Salam': { en: 'Al-Salam', ar: 'السلام' },
    'National Gas': { en: 'National Gas', ar: 'الغاز الوطني' },
    'Global Gas': { en: 'Global Gas', ar: 'الغاز العالمي' },
    'Local': { en: 'Local', ar: 'محلي' }
};

function t(key) {
    if (!translations[key]) return key;
    return `${translations[key].en} / ${translations[key].ar}`;
}

// Function to listen for real-time updates from Realtime Database
function listenToStations() {
    if (!db) return;

    const markersRef = ref(db, "markers");

    onValue(markersRef, (snapshot) => {
        const data = snapshot.val();
        const updatedStations = [];

        if (data) {
            Object.keys(data).forEach((key) => {
                const station = data[key];

                // Process votes
                const votes = station.votes || {};
                const counts = { available: 0, low: 0, out: 0 };
                let userVote = null;

                if (votes.voters) {
                    Object.keys(votes.voters).forEach(uid => {
                        const v = votes.voters[uid];
                        if (counts[v] !== undefined) counts[v]++;
                        if (currentUser && uid === currentUser.uid) userVote = v;
                    });
                }

                updatedStations.push({
                    id: key,
                    ...station,
                    voteCounts: counts,
                    userVote: userVote,
                    lastUpdated: station.createdAt ? formatTime(new Date(station.createdAt)) : "Just now"
                });
            });
        }

        gasStations = updatedStations;
        applyFilters(); // Re-render markers and list whenever data changes
    }, (error) => {
        console.error("Error listening to markers:", error);
        alert("Failed to sync data in real-time. Please check your connection.");
    });
}

// Function to seed initial sample data for demonstration/first-run
async function seedInitialData() {
    if (!db) return;
    const sampleStations = [
        { name: "Bashayer Riyadh / بشاير الرياض", company: "Bashayer", status: "available", price: 15000, lat: 15.5785, lng: 32.5539, createdAt: Date.now(), reportedBy: "system" },
        { name: "Al-Neel Manshiya / نيل المنشية", company: "Al-Neel", status: "low", price: 15200, lat: 15.5922, lng: 32.5714, createdAt: Date.now(), reportedBy: "system" },
        { name: "Aman Omdurman / أمان أم درمان", company: "Aman", status: "out", price: 14800, lat: 15.6315, lng: 32.4789, createdAt: Date.now(), reportedBy: "system" },
        { name: "White Nile Bahri / النيل الأبيض بحري", company: "White Nile", status: "available", price: 15100, lat: 15.6214, lng: 32.5342, createdAt: Date.now(), reportedBy: "system" }
    ];

    const stationsRef = ref(db, "stations");

  for (const station of sampleStations) {
    await push(stationsRef, station);
  }
}

// Helper to format timestamps
function formatTime(date) {
    const now = new Date();
    const diff = Math.floor((now - date) / 1000); // seconds
    if (diff < 60) return "Just now";
    if (diff < 3600) return `${Math.floor(diff / 60)} mins ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)} hours ago`;

    const day = date.getDate();
    const month = date.getMonth() + 1;
    const year = date.getFullYear();

    return `${day}/${month}/${year}`;
}

// Start listening for data
listenToStations();

// Register Service Workers
window.addEventListener('load', () => {
    // 1. Register main PWA caching service worker
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('sw.js')
            .then(reg => console.log('PWA Service Worker registered for caching:', reg.scope))
            .catch(err => console.error('PWA caching registration failed:', err));

        // 2. Register FCM service worker separately
        navigator.serviceWorker.register('firebase-messaging-sw.js')
            .then(reg => {
                fcmRegistration = reg;
                console.log('FCM Service Worker registered:', reg.scope);
            })
            .catch(err => console.error('FCM SW registration failed:', err));
    }
});

// PWA Install Logic
let deferredPrompt;
const installBtn = document.getElementById('installBtn');
if (installBtn) {
    installBtn.style.display = 'flex';
}

window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    if (installBtn) {
        installBtn.style.display = 'flex';
        installBtn.style.alignItems = 'center';
        installBtn.style.justifyContent = 'center';
        installBtn.style.gap = '8px';
    }
});

if (installBtn) {
    installBtn.addEventListener('click', async () => {
        if (!deferredPrompt) {
            alert("install not available. Use browser menu");
            return;
        }
        // Show the install prompt
        deferredPrompt.prompt();
        // Wait for the user to respond to the prompt
        const { outcome } = await deferredPrompt.userChoice;
        console.log(`User response to install prompt: ${outcome}`);
        // We've used the prompt, and can't use it again, so clear it
        deferredPrompt = null;
        // Hide the install button
        installBtn.style.display = 'none';
    });
}

window.addEventListener('appinstalled', (evt) => {
    console.log('Gas Finder Sudan was installed to home screen!');
    if (installBtn) installBtn.style.display = 'none';
});

// Initialize Map centered on Khartoum, Sudan
const map = L.map('map', {
    zoomControl: false // Customizing zoom control location
}).setView([15.5527, 32.5324], 13);
// 
L.control.zoom({
    position: 'bottomleft'
}).addTo(map);

// Add OpenStreetMap tiles
L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
    attribution: '&copy; OpenStreetMap contributors &copy; CARTO',
    subdomains: 'abcd',
    maxZoom: 20
}).addTo(map);

// Locate Me Control
const locateBtn = L.control({ position: 'topleft' });
locateBtn.onAdd = function () {
    const div = L.DomUtil.create('div', 'leaflet-bar leaflet-control leaflet-control-custom');
    div.innerHTML = '<button title="Find my location" style="background: white; border: none; width: 34px; height: 34px; cursor: pointer; display: flex; align-items: center; justify-content: center; font-size: 1.2rem; color: var(--text-primary); border-radius: 4px;"><i class="fa-solid fa-location-crosshairs"></i></button>';
    div.onclick = function () {
        map.locate({ setView: true, maxZoom: 16 });
    };
    return div;
};
locateBtn.addTo(map);

map.on('locationfound', (e) => {
    L.circle(e.latlng, e.accuracy).addTo(map);
    selectedLocation = e.latlng;
});

map.on('locationerror', (e) => {
    console.error(e.message);
});


// Custom Search Bar Logic (Improved with Autocomplete Suggestions)
const mapSearchForm = document.getElementById('mapSearchForm');
const mapSearchInput = document.getElementById('mapSearchInput');
const searchSuggestions = document.getElementById('searchSuggestions');

if (mapSearchForm && mapSearchInput && searchSuggestions) {
    const searchIcon = mapSearchForm.querySelector('i');
    let debounceTimer;

    // Helper to clear suggestions
    const clearSuggestions = () => {
        searchSuggestions.innerHTML = '';
        searchSuggestions.style.display = 'none';
    };

    // Close suggestions when clicking outside
    document.addEventListener('click', (e) => {
        if (!mapSearchForm.contains(e.target) && !searchSuggestions.contains(e.target)) {
            clearSuggestions();
        }
    });

    mapSearchInput.addEventListener('input', () => {
        const query = mapSearchInput.value.trim().toLowerCase();
        clearTimeout(debounceTimer);

        if (query.length < 2) {
            clearSuggestions();
            return;
        }

        debounceTimer = setTimeout(async () => {
            // STEP 1: Get Local Station Matches
            const localMatches = gasStations.filter(s => 
                s.name.toLowerCase().includes(query) || 
                s.company.toLowerCase().includes(query)
            ).slice(0, 3); // Top 3 locals

            // STEP 2: Fetch Global Suggestions from Nominatim
            try {
                const response = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=5`);
                const globalResults = await response.json();

                // Build UI
                searchSuggestions.innerHTML = '';
                
                // Add Stations First
                localMatches.forEach(station => {
                    const div = document.createElement('div');
                    div.className = 'suggestion-item';
                    div.innerHTML = `<i class="fa-solid fa-gas-pump"></i> <div><b>${station.name}</b><br><small>${station.company}</small></div>`;
                    div.onclick = () => {
                        mapSearchInput.value = station.name;
                        map.flyTo([station.lat, station.lng], 16);
                        const marker = markersMap.get(station.id);
                        if (marker) setTimeout(() => marker.openPopup(), 1000);
                        clearSuggestions();
                    };
                    searchSuggestions.appendChild(div);
                });

                // Add Locations
                globalResults.forEach(res => {
                    const div = document.createElement('div');
                    div.className = 'suggestion-item';
                    div.innerHTML = `<i class="fa-solid fa-location-dot"></i> <span>${res.display_name}</span>`;
                    div.onclick = () => {
                        mapSearchInput.value = res.display_name;
                        const lat = parseFloat(res.lat);
                        const lon = parseFloat(res.lon);
                        map.flyTo([lat, lon], 14);
                        
                        const tempMarker = L.marker([lat, lon]).addTo(map)
                            .bindPopup(`<b>${res.display_name}</b>`)
                            .openPopup();
                        setTimeout(() => map.removeLayer(tempMarker), 8000);
                        clearSuggestions();
                    };
                    searchSuggestions.appendChild(div);
                });

                if (localMatches.length > 0 || globalResults.length > 0) {
                    searchSuggestions.style.display = 'block';
                } else {
                    clearSuggestions();
                }

            } catch (err) {
                console.error("Autocomplete error:", err);
            }
        }, 400); // 400ms debounce
    });

    mapSearchForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const query = mapSearchInput.value.trim();
        if (!query) return;

        clearSuggestions();
        mapSearchForm.classList.remove('active'); // Collapse after search

        if (searchIcon) {
            searchIcon.className = "fa-solid fa-circle-notch fa-spin";
            searchIcon.style.color = "var(--accent-color)";
        }
        
        try {
            const matchedStation = gasStations.find(station => 
                station.name.toLowerCase().includes(query.toLowerCase()) || 
                station.company.toLowerCase().includes(query.toLowerCase())
            );

            if (matchedStation) {
                map.flyTo([matchedStation.lat, matchedStation.lng], 16);
                const marker = markersMap.get(matchedStation.id);
                if (marker) setTimeout(() => marker.openPopup(), 1500);
                showToast(`Found: ${matchedStation.name}`, "success");
            } else {
                const response = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=1`);
                const results = await response.json();

                if (results && results.length > 0) {
                    const res = results[0];
                    const lat = parseFloat(res.lat);
                    const lon = parseFloat(res.lon);
                    map.flyTo([lat, lon], 14);
                    const tempMarker = L.marker([lat, lon]).addTo(map).bindPopup(`<b>${res.display_name}</b>`).openPopup();
                    setTimeout(() => map.removeLayer(tempMarker), 8000);
                } else {
                    showToast("No location found / لم يتم العثور على المكان", "error");
                }
            }
        } catch (err) {
            console.error("Search error:", err);
            showToast("Search failed / فشل البحث", "error");
        } finally {
            if (searchIcon) {
                searchIcon.className = "fa-solid fa-search";
                searchIcon.style.color = "#9aa0a6";
            }
        }
    });

    if (searchIcon) {
        searchIcon.style.cursor = 'pointer';
        searchIcon.onclick = (e) => {
            e.stopPropagation();
            mapSearchForm.classList.toggle('active');
            if (mapSearchForm.classList.contains('active')) {
                setTimeout(() => mapSearchInput.focus(), 300);
            }
        };
    }
}

// Track current markers on the map
let currentMarkers = [];

// Helper function to create custom Leaflet DivIcons
function createCustomIcon(status) {
    return L.divIcon({
        className: 'custom-div-icon',
        html: `<div class='marker-pin ${status}'></div>`,
        iconSize: [30, 42],
        iconAnchor: [15, 42],
        popupAnchor: [0, -35]
    });
}

// Function to render markers on map
function renderMarkers(stations) {
    // Clear markers that are no longer in the list
    const stationIds = new Set(stations.map(s => s.id));
    for (const [id, marker] of markersMap.entries()) {
        if (!stationIds.has(id)) {
            map.removeLayer(marker);
            markersMap.delete(id);
        }
    }

    stations.forEach(station => {
        let marker = markersMap.get(station.id);

        if (!marker) {
            // Create new marker if it doesn't exist
            const icon = createCustomIcon(station.status);
            marker = L.marker([station.lat, station.lng], { icon: icon }).addTo(map);
            markersMap.set(station.id, marker);
        } else {
            // Update existing marker icon if status changed
            marker.setIcon(createCustomIcon(station.status));
            marker.setLatLng([station.lat, station.lng]);
        }

        // Popup Content
        let statusIcon = '';
        if (station.status === 'available') statusIcon = '<i class="fa-solid fa-check-circle" style="color:var(--status-available);"></i>';
        if (station.status === 'low') statusIcon = '<i class="fa-solid fa-triangle-exclamation" style="color:var(--status-low);"></i>';
        if (station.status === 'out') statusIcon = '<i class="fa-solid fa-xmark-circle" style="color:var(--status-out);"></i>';

        const isOwner = currentUser && (station.userId === currentUser.uid || station.reportedBy === currentUser.uid);

        const popupContent = `
            <div class="custom-popup-content" style="min-width: 180px; padding: 5px;">
                <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 4px;">
                    <h3 style="margin: 0; font-size: 1.1rem; color: var(--text-primary); font-weight: 700;">${station.name}</h3>
                </div>
                <p style="margin: 0 0 8px 0; font-size: 0.75rem; color: var(--text-sec); text-transform: uppercase; font-weight: 600;">${station.company}</p>
                
                <div style="background: var(--bg-color); border-radius: 8px; padding: 10px; margin-bottom: 10px; border: 1px solid var(--border-color);">
                    <div style="font-size: 1.25rem; font-weight: 800; color: var(--accent-color); margin-bottom: 4px;">
                        ${station.price} <span style="font-size: 0.7rem; font-weight: 600; color: var(--text-sec);">SDG</span>
                    </div>
                    <div style="display: flex; align-items: center; gap: 6px; font-weight: 700; font-size: 0.9rem;">
                        ${statusIcon} ${station.status.toUpperCase()}
                    </div>
                </div>

                <div style="margin-bottom: 12px;">
                    <p style="font-size: 0.7rem; font-weight: 700; color: var(--text-sec); text-transform: uppercase; margin-bottom: 8px;">Community Verification / الإبلاغ</p>
                    <div class="verification-group">
                        <button onclick="vote('${station.id}', 'available')" class="vote-btn ${station.userVote === 'available' ? 'active available' : ''}">
                            <i class="fa-solid fa-check-circle"></i>
                            <span class="vote-count">${station.voteCounts?.available || 0}</span>
                            <span class="vote-label">Yes / نعم</span>
                        </button>
                        <button onclick="vote('${station.id}', 'low')" class="vote-btn ${station.userVote === 'low' ? 'active low' : ''}">
                            <i class="fa-solid fa-triangle-exclamation"></i>
                            <span class="vote-count">${station.voteCounts?.low || 0}</span>
                            <span class="vote-label">Low / قليل</span>
                        </button>
                        <button onclick="vote('${station.id}', 'out')" class="vote-btn ${station.userVote === 'out' ? 'active out' : ''}">
                            <i class="fa-solid fa-circle-xmark"></i>
                            <span class="vote-count">${station.voteCounts?.out || 0}</span>
                            <span class="vote-label">No / لا</span>
                        </button>
                    </div>
                </div>
                
                <div style="display: flex; justify-content: space-between; align-items: center; border-top: 1px solid var(--border-color); padding-top: 8px;">
                    <small style="color: #94a3b8; font-size: 0.7rem;"><i class="fa-regular fa-clock"></i> ${station.lastUpdated || 'Just now'}</small>
                    ${isOwner ? `
                        <div style="display: flex; gap: 10px;">
                            <button onclick="editStation('${station.id}')" title="Edit / تعديل" style="background: var(--accent-color); color: white; border: none; padding: 4px 10px; border-radius: 6px; font-size: 0.7rem; font-weight: 600; cursor: pointer; display: flex; align-items: center; gap: 4px;">
                                <i class="fa-solid fa-pen"></i> Edit
                            </button>
                            <button onclick="window.deleteStation('${station.id}')" title="Delete / حذف" style="background: #ef4444; color: white; border: none; padding: 4px 10px; border-radius: 6px; font-size: 0.7rem; font-weight: 600; cursor: pointer; display: flex; align-items: center; gap: 4px;">
                                <i class="fa-solid fa-trash-can"></i> Delete
                            </button>
                        </div>
                    ` : ''}
                </div>
            </div>
        `;

        marker.bindPopup(popupContent, {
            className: 'custom-leaflet-popup',
            maxWidth: 250
        });
    });
}

// Function to handle voting
window.vote = async (stationId, voteType) => {
    if (!currentUser) {
        showToast("❌ Please login first / يرجى تسجيل الدخول أولاً", "error");
        authModal.classList.add('active');
        return;
    }

    try {
        const voteRef = ref(db, `markers/${stationId}/votes/voters/${currentUser.uid}`);

        // If user clicks the same vote twice, remove it (un-vote)
        const currentStation = gasStations.find(s => s.id === stationId);
        if (currentStation && currentStation.userVote === voteType) {
            await remove(voteRef);
            showToast("🗳️ Vote removed / تم إزالة تصويتك", "success");
        } else {
            await set(voteRef, voteType);
            const emojis = { available: "👍", low: "⚠️", out: "❌" };
            showToast(`${emojis[voteType]} Vote recorded! / تم تسجيل تصويتك`, "success");
        }
    } catch (error) {
        console.error("Voting error:", error);
        showToast("❌ Error saving vote / حدث خطأ أثناء التصويت", "error");
    }
};

// Toast notification function
function showToast(message, type = "success") {
    let container = document.getElementById('toast-container');
    if (!container) {
        container = document.createElement('div');
        container.id = 'toast-container';
        document.body.appendChild(container);
    }

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `<span>${message}</span>`;

    container.appendChild(toast);

    // Remove toast after animation ends
    setTimeout(() => {
        toast.remove();
        if (container.childNodes.length === 0) container.remove();
    }, 3000);
}

// Function to delete a station
window.deleteStation = async (id) => {
    if (!currentUser) {
        alert("Please login first.");
        return;
    }

    const station = gasStations.find(s => s.id === id);
    if (!station) return;

    if (station.userId !== currentUser.uid && station.reportedBy !== currentUser.uid) {
        alert("You can only delete your own markers.");
        return;
    }

    if (!confirm("Are you sure you want to delete this marker?")) return;

    try {
        await remove(ref(db, "markers/" + id));
        alert("Marker deleted successfully.");
    } catch (error) {
        console.error("Error deleting marker:", error);
        alert("Failed to delete marker: " + error.message);
    }
};
window.editStation = function(id) {
    console.log("Edit clicked", id);

    if (!currentUser) {
        alert("Please login first.");
        return;
    }

    const station = gasStations.find(s => s.id === id);
    if (!station) return;

    document.getElementById('reportLocation').value = station.name;
    document.getElementById('reportCompany').value = station.company;
    document.getElementById('reportPrice').value = station.price;

    const statusInput = document.querySelector(`input[name="status"][value="${station.status}"]`);
    if (statusInput) statusInput.checked = true;

    reportForm.dataset.editId = id;

    selectedLocation = {
        lat: station.lat,
        lng: station.lng
    };

    reportModal.classList.add('active');
};
// Function to render stations list in sidebar
function renderList(stations) {
    const listContainer = document.getElementById('stationsList');
    const resultsCount = document.getElementById('resultsCount');

    listContainer.innerHTML = `
        <div style="text-align: center; padding: 2rem; color: var(--text-sec);">
            <i class="fa-solid fa-circle-notch fa-spin" style="font-size: 2rem; margin-bottom: 1rem;"></i>
            <p>Fetching gas stations...</p>
        </div>
    `;
    resultsCount.textContent = `Finding...`;

    if (stations.length === 0) {
        listContainer.innerHTML = `
            <div style="text-align: center; padding: 2rem; color: var(--text-sec);">
                <i class="fa-solid fa-gas-pump" style="font-size: 2rem; margin-bottom: 1rem; opacity: 0.5;"></i>
                <p>No stations found matching your criteria.</p>
            </div>
        `;
        return;
    }

    // Find cheapest available station
    const minPrice = Math.min(...stations.filter(s => s.status !== 'out').map(s => s.price));

    stations.forEach(station => {
        let statusClass = station.status;
        let statusIcon = station.status === 'available' ? 'fa-check-circle' : station.status === 'low' ? 'fa-triangle-exclamation' : 'fa-xmark-circle';
        const isCheapest = station.status !== 'out' && station.price === minPrice;

        // Calculate distance if location is available
        let distanceText = '~ 1 km';
        if (selectedLocation) {
            const dist = map.distance(selectedLocation, [station.lat, station.lng]) / 1000;
            distanceText = `${dist.toFixed(1)} km`;
        }

        const card = document.createElement('div');
        card.className = `station-card ${isCheapest ? 'cheapest-highlight' : ''}`;
        card.innerHTML = `
        
            ${isCheapest ? '<div class="cheapest-badge"><i class="fa-solid fa-tag"></i> Cheapest / الأرخص</div>' : ''}
            
            <div class="station-header">

                <div class="station-title-group">
                
                    <div class="station-name">${station.name}</div>

                    <div class="station-company">${t(station.company)}</div>
                </div>
                <div class="price-display">

                    <div class="price-val">${station.price}</div>
                    <div class="price-curr">SDG</div>
                </div>
            </div>
            <div class="status-row">
                 <div class="status-badge ${station.status}">
                    <i class="fa-solid ${statusIcon}"></i> <span>${translations[station.status].en}</span><small style="font-size: 0.7em; margin-left: 2px;">${translations[station.status].ar}</small>
                </div>
                
                <div style="display: flex; gap: 10px; align-items: center; width: 100%;">
                    <div class="verification-group" style="flex: 1;">
                        <button onclick="event.stopPropagation(); vote('${station.id}', 'available')" class="vote-btn ${station.userVote === 'available' ? 'active available' : ''}" title="Available">
                            <i class="fa-solid fa-check-circle"></i>
                            <span class="vote-count">${station.voteCounts.available}</span>
                            <span class="vote-label">Available</span>
                        </button>
                        <button onclick="event.stopPropagation(); vote('${station.id}', 'low')" class="vote-btn ${station.userVote === 'low' ? 'active low' : ''}" title="Low">
                            <i class="fa-solid fa-triangle-exclamation"></i>
                            <span class="vote-count">${station.voteCounts.low}</span>
                            <span class="vote-label">Low</span>
                        </button>
                        <button onclick="event.stopPropagation(); vote('${station.id}', 'out')" class="vote-btn ${station.userVote === 'out' ? 'active out' : ''}" title="Out">
                            <i class="fa-solid fa-circle-xmark"></i>
                            <span class="vote-count">${station.voteCounts.out}</span>
                            <span class="vote-label">Out</span>
                        </button>
                    </div>
                </div>
            </div>
            <div class="station-footer">
                <div class="distance"><i class="fa-solid fa-location-dot"></i> ${distanceText}</div>
                <div class="last-updated"><i class="fa-regular fa-clock"></i> ${station.lastUpdated}</div>
            </div>
        `;

        // Center map on station click
        card.addEventListener('click', () => {
            map.flyTo([station.lat, station.lng], 16, {
                animate: true,
                duration: 1.5
            });
            // Also open tooltip
            const m = markersMap.get(station.id);
            if (m) {
                setTimeout(() => m.openPopup(), 1500); // Wait for flyTo
            }
        });

        listContainer.appendChild(card);
    });
}

// Dynamic UI Generation
function setupDynamicUI() {
    // 1. Populate Filter Chips
    const filtersContainer = document.getElementById('companyFilters');
    filtersContainer.innerHTML = `<button class="chip active" data-company="All">All / الكل</button>`;

    GAS_COMPANIES.forEach(company => {
        const btn = document.createElement('button');
        btn.className = 'chip';
        btn.dataset.company = company;
        btn.innerText = t(company);
        btn.onclick = () => {
            document.querySelectorAll('.chip').forEach(c => c.classList.remove('active'));
            btn.classList.add('active');
            currentFilter = company;
            applyFilters();
        };
        filtersContainer.appendChild(btn);
    });

    // Special Case for "All" button
    filtersContainer.querySelector('[data-company="All"]').onclick = (e) => {
        document.querySelectorAll('.chip').forEach(c => c.classList.remove('active'));
        e.target.classList.add('active');
        currentFilter = 'All';
        applyFilters();
    };

    // 2. Populate Report Form Dropdown
    const reportSelect = document.getElementById('reportCompany');
    reportSelect.innerHTML = `<option value="" disabled selected>Select Company / اختر الشركة</option>`;

    GAS_COMPANIES.forEach(company => {
        const opt = document.createElement('option');
        opt.value = company;
        opt.innerText = t(company);
        reportSelect.appendChild(opt);
    });
}

// Call setup
setupDynamicUI();

// Filtering Logic
const searchInput = document.getElementById('searchInput');

let currentFilter = 'All';
let currentSearch = '';

function applyFilters() {
    let filtered = gasStations.filter(station => {
        // Company Filter
        let matchesCompany = currentFilter === 'All' || station.company === currentFilter;

        // Search Filter
        let matchesSearch = station.name.toLowerCase().includes(currentSearch.toLowerCase()) ||
            station.company.toLowerCase().includes(currentSearch.toLowerCase());

        return matchesCompany && matchesSearch;
    });

    // Sort by Nearest primary and Cheapest secondary
    if (selectedLocation) {
        filtered.sort((a, b) => {
            const distA = map.distance(selectedLocation, [a.lat, a.lng]);
            const distB = map.distance(selectedLocation, [b.lat, b.lng]);
            if (Math.abs(distA - distB) > 500) { // If distance difference > 500m
                return distA - distB;
            }
            return a.price - b.price; // Else sort by price
        });
    } else {
        filtered.sort((a, b) => a.price - b.price); // Default to cheapest
    }

    renderList(filtered);
    renderMarkers(filtered);
}

// Initial Render
renderMarkers(gasStations);
renderList(gasStations);

// Search input event
searchInput.addEventListener('input', (e) => {
    currentSearch = e.target.value;
    applyFilters();
});

// --- COLLAPSIBLE DRAWER LOGIC ---
const listToggleBtn = document.getElementById('listToggleBtn');
const sidebarDrawer = document.getElementById('sidebar');
const closeDrawerBtn = document.getElementById('closeDrawer');

if (listToggleBtn && sidebarDrawer) {
    listToggleBtn.addEventListener('click', () => {
        sidebarDrawer.classList.toggle('active');
        listToggleBtn.style.opacity = sidebarDrawer.classList.contains('active') ? "0" : "1";
    });
}

if (closeDrawerBtn && sidebarDrawer) {
    closeDrawerBtn.addEventListener('click', () => {
        sidebarDrawer.classList.remove('active');
        if (listToggleBtn) listToggleBtn.style.opacity = "1";
    });
}

// Modal Logic
const reportModal = document.getElementById('reportModal');
const reportBtn = document.getElementById('reportBtn');
const closeModalBtn = document.getElementById('closeModal');
const reportForm = document.getElementById('reportForm');

reportBtn.addEventListener('click', () => {
    if (!currentUser) {
        alert("Please login first to report gas availability.");
        authModal.classList.add('active');
        return;
    }

    // Start location selection mode
    alert("Please click on the map to set the location of the gas station.");
    document.getElementById('map').style.cursor = 'crosshair';

    const onMapClick = (e) => {
        selectedLocation = e.latlng;

        // Remove previous temp marker
        if (tempMarker) map.removeLayer(tempMarker);

        // Add new temp marker
        tempMarker = L.marker(e.latlng, {
            icon: createCustomIcon('available'),
            draggable: true
        }).addTo(map);

        tempMarker.on('dragend', (event) => {
            selectedLocation = event.target.getLatLng();
        });

        // Show modal after selecting location
        reportModal.classList.add('active');
        document.getElementById('map').style.cursor = '';
        map.off('click', onMapClick);
    };

    map.on('click', onMapClick);
});

// Handle Form Submission (Real Firebase Updates + Edit Support)
reportForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const locationName = document.getElementById('reportLocation').value;
    const company = document.getElementById('reportCompany').value;
    const status = document.querySelector('input[name="status"]:checked').value;
    const price = parseInt(document.getElementById('reportPrice').value);
    const editId = reportForm.dataset.editId;

    const submitBtn = reportForm.querySelector('button[type="submit"]');
    const originalBtnText = editId ? "Update Status / تحديث" : "Report Gas Status / إرسال البلاغ";
    
    submitBtn.innerText = "Saving...";
    submitBtn.disabled = true;

    if (!db) {
        alert("Database is not yet connected.");
        submitBtn.disabled = false;
        submitBtn.innerText = originalBtnText;
        return;
    }

    try {
        if (!selectedLocation && !editId) {
            alert("Please select a location on the map first.");
            submitBtn.disabled = false;
            submitBtn.innerText = originalBtnText;
            return;
        }

        const stationData = {
            name: locationName,
            company: company,
            status: status,
            price: price,
            reportedBy: currentUser?.uid || "anonymous",
            lastUpdated: new Date().toLocaleString()
        };

        if (editId) {
            // UPDATE existing marker
            await update(ref(db, "markers/" + editId), stationData);
            showToast("Station updated successfully", "success");
        } else {
            // PUSH new marker
            stationData.lat = selectedLocation.lat;
            stationData.lng = selectedLocation.lng;
            stationData.createdAt = serverTimestamp();
            stationData.userId = currentUser.uid;
            
            await push(ref(db, "markers"), stationData);
            showToast("New station reported!", "success");
        }

        closeReportModal();
    } catch (err) {
        console.error("Submission error:", err);
        showToast("Error saving report", "error");
    } finally {
        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.innerText = originalBtnText;
        }
    }
});

function closeReportModal() {
    reportForm.reset();
    delete reportForm.dataset.editId;
    const submitBtn = reportForm.querySelector('button[type="submit"]');
    if (submitBtn) submitBtn.innerText = "Report Gas Status / إرسال البلاغ";
    reportModal.classList.remove('active');
    if (tempMarker) {
        map.removeLayer(tempMarker);
        tempMarker = null;
    }
}

closeModalBtn.addEventListener('click', closeReportModal);

// Close modal if clicked outside content
reportModal.addEventListener('click', (e) => {
    if (e.target === reportModal) {
        closeReportModal();
    }
});

// --- FIREBASE AUTHENTICATION LOGIC ---

const profileBtn = document.getElementById('profileBtn');
const authModal = document.getElementById('authModal');
const closeAuthModal = document.getElementById('closeAuthModal');
const authForm = document.getElementById('authForm');
const authToggleBtn = document.getElementById('authToggleBtn');
const authToggleText = document.getElementById('authToggleText');
const authTitle = document.getElementById('authTitle');
const authSubmitBtn = document.getElementById('authSubmitBtn');
const nameGroup = document.getElementById('nameGroup');
const authErrorMsg = document.getElementById('authErrorMsg');

const profileModal = document.getElementById('profileModal');
const closeProfileModal = document.getElementById('closeProfileModal');
const logoutBtn = document.getElementById('logoutBtn');
const profileNameDisplay = document.getElementById('profileNameDisplay');
const profileEmailDisplay = document.getElementById('profileEmailDisplay');

let isSignupMode = false;

// Toggle Login / Signup
authToggleBtn.addEventListener('click', (e) => {
    e.preventDefault();
    isSignupMode = !isSignupMode;
    if (isSignupMode) {
        authTitle.innerText = "Create an Account";
        authToggleText.innerText = "Already have an account?";
        authToggleBtn.innerText = "Login";
        authSubmitBtn.innerText = "Sign Up";
        nameGroup.style.display = "block";
    } else {
        authTitle.innerText = "Login to Gas Finder";
        authToggleText.innerText = "Don't have an account?";
        authToggleBtn.innerText = "Sign up";
        authSubmitBtn.innerText = "Login";
        nameGroup.style.display = "none";
    }
    authErrorMsg.style.display = "none";
});

// Open Auth/Profile Modal
profileBtn.addEventListener('click', () => {

  const user = auth.currentUser;

  const profileName = document.getElementById("profileName");
  const profileEmail = document.getElementById("profileEmail");
  const profilePhoto = document.getElementById("profilePhoto");

  if (user) {
    // تحديث البيانات قبل فتح المودال
    if (profileName) profileName.textContent = user.displayName || "No Name";
    if (profileEmail) profileEmail.textContent = user.email;
    if (profilePhoto) profilePhoto.src = user.photoURL || "default.png";

    profileModal.classList.add('active');

  } else {
    authModal.classList.add('active');
  }

});

closeAuthModal.addEventListener('click', () => authModal.classList.remove('active'));
closeProfileModal.addEventListener('click', () => profileModal.classList.remove('active'));

// Close on outside click is already handled globally above, but let's extend it
[authModal, profileModal].forEach(modal => {
    modal.addEventListener('click', (e) => {
        if (e.target === modal) modal.classList.remove('active');
    });
});

// Form Submission handling Firebase
authForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('authEmail').value.trim();
    const password = document.getElementById('authPassword').value;
    const name = document.getElementById('authName').value;

    authErrorMsg.style.display = "none";

    if (!email.includes('@')) {
        authErrorMsg.style.display = 'flex';
        authErrorMsg.innerHTML = `<i class="fa-solid fa-circle-exclamation"></i> يرجى إدخال بريد إلكتروني صحيح يشمل @`;
        return;
    }

    if (password.length < 6) {
        authErrorMsg.style.display = 'flex';
        authErrorMsg.innerHTML = `<i class="fa-solid fa-circle-exclamation"></i> كلمة المرور يجب أن تكون 6 أحرف على الأقل`;
        return;
    }

    authSubmitBtn.innerText = "جاري التحميل...";
    authSubmitBtn.disabled = true;

    try {
        if (isSignupMode) {
            const userCredential = await createUserWithEmailAndPassword(auth, email, password);
            if (name) await updateProfile(userCredential.user, { displayName: name });
            showToast("\u2705 تم إنشاء الحساب بنجاح!", "success");
        } else {
            await signInWithEmailAndPassword(auth, email, password);
            showToast("\u2705 تم تسجيل الدخول بنجاح!", "success");
        }
        authModal.classList.remove('active');
        authForm.reset();
    } catch (error) {
        // Translate Firebase errors to Arabic
        const errorMessages = {
            'auth/invalid-credential':    '\u274c البريد الإلكتروني أو كلمة المرور غير صحيحة',
            'auth/user-not-found':        '\u274c لا يوجد حساب بهذا البريد الإلكتروني',
            'auth/wrong-password':        '\u274c كلمة المرور غير صحيحة',
            'auth/email-already-in-use':  '\u274c هذا البريد الإلكتروني مستخدم بالفعل',
            'auth/too-many-requests':     '\u274c تم حظر الحساب مؤقتاً، حاول لاحقاً',
            'auth/network-request-failed':'\u274c فشل الاتصال بالإنترنت، تحقق من الشبكة',
            'auth/invalid-email':         '\u274c صيغة البريد الإلكتروني غير صحيحة',
        };
        const msg = errorMessages[error.code] || ('\u274c ' + error.message);
        authErrorMsg.innerHTML = msg;
        authErrorMsg.style.display = 'flex';
    } finally {
        authSubmitBtn.disabled = false;
        authSubmitBtn.innerText = isSignupMode ? "إنشاء حساب" : "تسجيل الدخول";
    }
});

// Logout
logoutBtn.addEventListener('click', async () => {
    try {
        await signOut(auth);

        // 👇 مهم جداً
        currentUser = null;

        // تحديث الواجهة
        updateUIOnAuthChange(null);

        // إغلاق المودال
        profileModal.classList.remove('active');

        // إعادة ضبط الفورم
        authForm.reset();

        // 👇 أهم خطوة (تحل المشكلة نهائياً)
        location.reload();

    } catch (error) {
        console.error("Logout error:", error);
    }
});

// Auth State Changed Observer
if (auth) {
    onAuthStateChanged(auth, async (user) => {
        currentUser = user;
        updateUIOnAuthChange(user);
        if (user) {
            saveUserToDatabase(user);
            // تحديث الخريطة والقائمة لإظهار تصويتات المستخدم الجديد
            applyFilters();
        } else {
            // عند تسجيل الخروج: امسح تصويتات المستخدم القديم من الذاكرة
            gasStations = gasStations.map(s => ({ ...s, userVote: null }));
            applyFilters();
        }
    });
}

async function saveUserToDatabase(user) {
    if (!db) return;
    try {
        const userRef = ref(db, "users/" + user.uid);
        await update(userRef, {
            name: user.displayName || "Anonymous",
            email: user.email,
            photoURL: user.photoURL || null,
            lastSeen: serverTimestamp()
        });
        console.log("User data saved successfully.");
    } catch (err) {
        console.error("Error saving user data:", err);
    }
}

function updateUIOnAuthChange(user) {
    const searchProfileBtn = document.getElementById('searchProfileBtn');

    // إعادة تعيين عناصر الـ profile modal دائمًا قبل التحديث
    const profileNameDisplay = document.getElementById('profileNameDisplay');
    const profileEmailDisplay = document.getElementById('profileEmailDisplay');

    if (user) {
        const photoHtml = user.photoURL
            ? `<img src="${user.photoURL}" class="profile-avatar">`
            : `<i class="fa-solid fa-user-check" style="color: var(--status-available);"></i>`;

        profileBtn.innerHTML = photoHtml;
        if (searchProfileBtn) searchProfileBtn.innerHTML = photoHtml;

        const profileIconParent = document.getElementById('profileModalIcon')?.parentElement;
        if (profileIconParent) {
            profileIconParent.innerHTML = user.photoURL
                ? `<img src="${user.photoURL}" class="profile-avatar" style="width: 80px; height: 80px;">`
                : `<i class="fa-regular fa-user" id="profileModalIcon"></i>`;
        }

        if (profileNameDisplay) profileNameDisplay.innerText = user.displayName || "Gas Finder User";
        if (profileEmailDisplay) profileEmailDisplay.innerText = user.email || "";
    } else {
        profileBtn.innerHTML = `<i class="fa-regular fa-user"></i>`;
        if (searchProfileBtn) searchProfileBtn.innerHTML = `<i class="fa-regular fa-user"></i>`;

        const profileIconParent = document.getElementById('profileModalIcon')?.parentElement;
        if (profileIconParent) {
            profileIconParent.innerHTML = `<i class="fa-regular fa-user" id="profileModalIcon"></i>`;
        }

        // مسح بيانات المستخدم القديم من الـ modal
        if (profileNameDisplay) profileNameDisplay.innerText = "";
        if (profileEmailDisplay) profileEmailDisplay.innerText = "";
    }
}

// ─── Google Login ───────────────────────────────────────────────────────────
// Mobile browsers CANNOT return popup results to the opener page.
// Solution: redirect on mobile, popup on desktop.
function isMobileBrowser() {
    return /Android|iPhone|iPad|iPod|Mobile|webOS|BlackBerry|IEMobile|Opera Mini/i
        .test(navigator.userAgent);
}

// On page load: check if we're returning from a Google redirect (mobile flow)
if (auth) {
    getRedirectResult(auth)
        .then((result) => {
            if (result && result.user) {
                // User just returned from Google redirect — login successful
                const authModalEl = document.getElementById('authModal');
                if (authModalEl) authModalEl.classList.remove('active');
                showToast("✅ تم تسجيل الدخول بـ Google!", "success");
            }
        })
        .catch((error) => {
            // Ignore expected "no pending redirect" errors on fresh page loads
            const ignorable = ['auth/no-current-user', 'auth/null-user', 'auth/web-storage-unsupported'];
            if (!ignorable.includes(error.code)) {
                console.warn("Redirect result error:", error.code, error.message);
            }
        });
}

const googleAuthBtn = document.getElementById('googleAuthBtn');
if (googleAuthBtn) {
    googleAuthBtn.addEventListener('click', async () => {
        if (!auth) {
            showToast("❌ Firebase not initialized", "error");
            return;
        }

        const provider = new GoogleAuthProvider();
        provider.setCustomParameters({ prompt: 'select_account' });

        googleAuthBtn.disabled = true;
        googleAuthBtn.innerHTML = `<i class="fa-solid fa-circle-notch fa-spin"></i> جاري الاتصال...`;

        if (isMobileBrowser()) {
            // ── MOBILE: redirect the entire page to Google, then back ──
            try {
                await signInWithRedirect(auth, provider);
                // Browser navigates away — nothing runs after this
            } catch (error) {
                console.error("Redirect error:", error);
                const authErrorMsgEl = document.getElementById('authErrorMsg');
                if (authErrorMsgEl) {
                    authErrorMsgEl.innerHTML = "❌ فشل الاتصال بـ Google، تحقق من الإنترنت";
                    authErrorMsgEl.style.display = 'flex';
                }
                googleAuthBtn.disabled = false;
                googleAuthBtn.innerHTML = `<img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" alt="Google"> <span>Continue with Google</span>`;
            }
        } else {
            // ── DESKTOP: use popup window ──
            try {
                const result = await signInWithPopup(auth, provider);
                if (result && result.user) {
                    authModal.classList.remove('active');
                    showToast("✅ تم تسجيل الدخول بـ Google!", "success");
                }
            } catch (error) {
                if (error.code !== 'auth/popup-closed-by-user' && error.code !== 'auth/cancelled-popup-request') {
                    const authErrorMsgEl = document.getElementById('authErrorMsg');
                    if (authErrorMsgEl) {
                        const googleErrors = {
                            'auth/popup-blocked':          '❌ المتصفح حجب النافذة — يرجى السماح بالنوافذ المنبثقة',
                            'auth/network-request-failed': '❌ فشل الاتصال، تحقق من الإنترنت',
                        };
                        authErrorMsgEl.innerHTML = googleErrors[error.code] || ('❌ ' + error.message);
                        authErrorMsgEl.style.display = 'flex';
                    }
                }
            } finally {
                googleAuthBtn.disabled = false;
                googleAuthBtn.innerHTML = `<img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" alt="Google"> <span>Continue with Google</span>`;
            }
        }
    });
}

// Update Price Modal Logic
window.openUpdatePriceModal = (stationId, currentPrice) => {
    if (!currentUser) {
        alert("Please login first to update prices.");
        authModal.classList.add('active');
        return;
    }
    document.getElementById('updateStationId').value = stationId;
    document.getElementById('newPriceInput').value = currentPrice;
    document.getElementById('updatePriceModal').classList.add('active');
};

// --- FIREBASE CLOUD MESSAGING (FCB/NOTIFICATIONS) ---
const notificationBtn = document.querySelector('.notification-btn');

async function requestNotificationPermission() {
    console.log("Notification button clicked.");
    if (!messaging) {
        console.error("Messaging not initialized.");
        alert("Firebase Messaging is not initialized. Please check your config.");
        return;
    }

    try {
        if (!window.Notification) {
            console.error("Browser does not support notifications.");
            alert("Your browser does not support push notifications. please use Chrome or actual Safari.");
            return;
        }

        console.log("Requesting browser permission...");
        const permission = await window.Notification.requestPermission();

        if (permission === 'granted') {
            console.log('Permission granted.');

            // Get FCM Token
            const vapidKey = 'BGNwIWBSTblwpxosxHmDR9xuhyrLdqdpWSnDLMlU4iKrE0XRXkQK1aEsE_pVetSmp0W6F1gZedvRVyHjYp_KVPw';

            try {
                console.log("Generating FCM Token...");
                const token = await getToken(messaging, {
                    vapidKey: vapidKey,
                    serviceWorkerRegistration: fcmRegistration
                });
                if (token) {
                    console.log('Token generated:', token);

                    // Save to Realtime Database
                    if (currentUser && db) {
                        try {
                            const userRef = ref(db, "users/" + currentUser.uid);
                            await update(userRef, { fcmToken: token });
                            console.log("Token saved to Database for user:", currentUser.uid);
                        } catch (dbErr) {
                            console.error("Error saving token to Database:", dbErr);
                        }
                    } else {
                        console.log("User not logged in or DB not ready, token not saved.");
                    }

                    // Update UI
                    if (notificationBtn) {
                        notificationBtn.innerHTML = `<i class="fa-solid fa-bell"></i> <i class="fa-solid fa-check" style="font-size: 0.8em;"></i>`;
                        notificationBtn.style.color = "var(--status-available)";
                        notificationBtn.style.borderColor = "var(--status-available)";
                    }
                    alert("Awesome! Notifications are enabled and connected!");
                } else {
                    console.warn('No FCM token received.');
                    alert("Unable to generate notification token. Please try again.");
                }
            } catch (tkErr) {
                console.error("Token generation error:", tkErr);
                alert("Failed to connect to Firebase Cloud Messaging: " + tkErr.message);
            }
        } else if (permission === 'denied') {
            console.warn("Permission denied by user.");
            alert("Notification permission denied! Please enable them in your browser settings.");
        }
    } catch (error) {
        console.error('Error occurred in notification flow:', error);
        alert("An error occurred: " + error.message);
    }
}

// Receive messages when app is in foreground
if (messaging) {
    onMessage(messaging, (payload) => {
        console.log('Foreground message received:', payload);
        const title = payload.notification?.title || "Gas Update / تحديث";
        const body = payload.notification?.body || "Check the map for new fuel availability!";

        // Custom feedback
        alert(`🔔 ${title}\n${body}`);

        // Increment badge
        const badge = document.querySelector('.badge');
        if (badge) {
            badge.innerText = parseInt(badge.innerText || "0") + 1;
            badge.style.display = "block";
        }
    });
}

if (notificationBtn) {
    notificationBtn.addEventListener('click', () => {
        requestNotificationPermission();
    });
}

// Update Price Modal Logic
window.openUpdatePriceModal = (stationId, currentPrice) => {
    if (!currentUser) {
        alert("Please login first to update prices.");
        authModal.classList.add('active');
        return;
    }
    const modalIdField = document.getElementById('updateStationId');
    const modalPriceField = document.getElementById('newPriceInput');
    const updateModal = document.getElementById('updatePriceModal');

    if (modalIdField) modalIdField.value = stationId;
    if (modalPriceField) modalPriceField.value = currentPrice;
    if (updateModal) updateModal.classList.add('active');
};

const closeUpdateModalBtn = document.getElementById('closeUpdateModal');
const updatePriceFormElement = document.getElementById('updatePriceForm');
const updatePriceModalOverlay = document.getElementById('updatePriceModal');

if (closeUpdateModalBtn) {
    closeUpdateModalBtn.onclick = () => {
        if (updatePriceModalOverlay) updatePriceModalOverlay.classList.remove('active');
    };
}

if (updatePriceFormElement) {
    updatePriceFormElement.onsubmit = async (e) => {
        e.preventDefault();
        const stationId = document.getElementById('updateStationId').value;
        const newPrice = parseInt(document.getElementById('newPriceInput').value);

        if (isNaN(newPrice) || newPrice < 1) {
            alert("Please enter a valid price.");
            return;
        }

        const submitBtn = updatePriceFormElement.querySelector('button[type="submit"]');
        submitBtn.innerText = "Updating...";
        submitBtn.disabled = true;

        try {
            const stationRef = ref(db, "markers/" + stationId);
            await update(stationRef, {
                price: newPrice,
                lastUpdatedBy: currentUser.uid,
                updatedAt: Date.now()
            });
            if (updatePriceModalOverlay) updatePriceModalOverlay.classList.remove('active');
            alert("Price updated successfully!");
        } catch (err) {
            console.error("Error updating price:", err);
            alert("Failed to update price: " + err.message);
        } finally {
            submitBtn.innerText = "Update Price / تحديث";
            submitBtn.disabled = false;
           
        }
    };
}
 seedInitialData();