/* ============================================
   VAssist — Map Service (Enhanced)
   Premium markers, animated routes, trail effects
   ============================================ */

class MapService {
    constructor() {
        // Initialize map with custom settings
        this.map = L.map('map', {
            zoomControl: false,
            attributionControl: false,
            maxZoom: 19,
            minZoom: 14,
            zoomSnap: 0.5,
            zoomDelta: 0.5
        }).setView(CONFIG.VIT_CENTER, 16);

        // Premium map tile layer
        L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
            attribution: '©OpenStreetMap ©CartoDB',
            maxZoom: 19,
            crossOrigin: true
        }).addTo(this.map);

        // Small attribution in corner
        L.control.attribution({ position: 'bottomleft', prefix: false }).addTo(this.map);

        this.markers = {};
        this.campusMarkers = [];
        this.routePolyline = null;
        this.trailPolyline = null;
        this.assistantMarker = null;

        this.loadCampusPoints();
    }

    // ── Set User Location ──
    setUserLocation(lat, lng) {
        this.map.flyTo([lat, lng], 16, {
            duration: 1.5,
            easeLinearity: 0.25
        });
        this.addMarker('user', lat, lng);
    }

    // ── Enhanced Marker System ──
    addMarker(type, lat, lng) {
        const iconConfigs = {
            user: {
                html: `<div class="user-marker-dot"></div>`,
                className: '',
                iconSize: [22, 22],
                iconAnchor: [11, 11]
            },
            store: {
                html: `<div style="
                    font-size: 1.6rem;
                    filter: drop-shadow(0 3px 6px rgba(0,0,0,0.3));
                    animation: bounce-in 0.5s cubic-bezier(0.68, -0.55, 0.265, 1.55) both;
                ">🏪</div>`,
                className: '',
                iconSize: [30, 30],
                iconAnchor: [15, 30]
            },
            assistant: {
                html: `<div style="
                    font-size: 1.8rem;
                    filter: drop-shadow(0 3px 8px rgba(0,0,0,0.35));
                    animation: float 2s ease-in-out infinite;
                ">🛵</div>`,
                className: '',
                iconSize: [34, 34],
                iconAnchor: [17, 17]
            }
        };

        const config = iconConfigs[type] || iconConfigs.user;

        // Remove existing marker of same type
        if (this.markers[type]) {
            this.map.removeLayer(this.markers[type]);
        }

        const icon = L.divIcon({
            html: config.html,
            className: config.className,
            iconSize: config.iconSize,
            iconAnchor: config.iconAnchor
        });

        this.markers[type] = L.marker([lat, lng], { icon }).addTo(this.map);
    }

    // ── Campus Points of Interest ──
    loadCampusPoints() {
        const iconMap = {
            academic: { emoji: '🎓', color: '#6C63FF' },
            hostel: { emoji: '🏠', color: '#FF6B6B' },
            hostel_f: { emoji: '🏠', color: '#FF69B4' },
            store: { emoji: '🍔', color: '#FFA502' },
            gate: { emoji: '🛑', color: '#FF4757' },
            amenity: { emoji: '🏀', color: '#2ED573' }
        };

        CAMPUS_DATA.forEach((loc, index) => {
            const iconConfig = iconMap[loc.type] || { emoji: '📍', color: '#6C63FF' };

            const marker = L.marker([loc.lat, loc.lng], {
                icon: L.divIcon({
                    html: `<div style="
                        font-size: 1.2rem;
                        cursor: pointer;
                        transition: transform 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275);
                        filter: drop-shadow(0 2px 4px rgba(0,0,0,0.2));
                        animation: scale-in 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275) ${index * 0.03}s both;
                    " onmouseover="this.style.transform='scale(1.4) translateY(-4px)'"
                       onmouseout="this.style.transform='scale(1)'"
                    >${iconConfig.emoji}</div>`,
                    className: '',
                    iconSize: [24, 24],
                    iconAnchor: [12, 12]
                })
            }).addTo(this.map);

            // Add tooltip with name
            marker.bindTooltip(loc.name, {
                direction: 'top',
                offset: [0, -12],
                className: 'campus-tooltip',
                opacity: 0.95
            });

            // Click -> dispatch event
            marker.on('click', () => {
                const event = new CustomEvent('location-selected', { detail: loc });
                document.dispatchEvent(event);

                // Brief pulse animation
                Utils.vibrate(30);
            });

            this.campusMarkers.push(marker);
        });
    }

    // ── Animated Route Drawing ──
    async drawRoute(start, end) {
        const url = `${CONFIG.API.OSRM}${start.lng},${start.lat};${end.lng},${end.lat}?overview=full&geometries=geojson`;

        try {
            const res = await fetch(url);
            const data = await res.json();
            if (!data.routes || !data.routes.length) return null;

            const route = data.routes[0];
            const coords = route.geometry.coordinates.map(c => [c[1], c[0]]);

            // Remove existing route
            if (this.routePolyline) this.map.removeLayer(this.routePolyline);
            if (this.trailPolyline) this.map.removeLayer(this.trailPolyline);

            // Background trail (wider, lighter)
            this.trailPolyline = L.polyline(coords, {
                color: '#6C63FF',
                weight: 10,
                opacity: 0.15,
                lineCap: 'round',
                lineJoin: 'round'
            }).addTo(this.map);

            // Main route line
            this.routePolyline = L.polyline(coords, {
                color: '#6C63FF',
                weight: 5,
                opacity: 0.85,
                lineCap: 'round',
                lineJoin: 'round',
                dashArray: '12, 6',
                className: 'animated-route'
            }).addTo(this.map);

            // Fit map to route
            this.map.fitBounds(this.routePolyline.getBounds(), {
                padding: [60, 60],
                maxZoom: 17,
                animate: true,
                duration: 0.8
            });

            const distKm = route.distance / 1000;
            const durationMin = Math.round(route.duration / 60);

            return {
                dist: distKm,
                duration: durationMin,
                coords: coords
            };
        } catch (e) {
            console.error('Route draw failed:', e);
            Utils.showToast('⚠️ Unable to find route. Try again.');
            return null;
        }
    }

    // ── Animated Assistant Movement with Trail ──
    animateAssistant(path, duration, onProgress, onComplete) {
        // Clean up previous
        if (this.assistantMarker) this.map.removeLayer(this.assistantMarker);

        const icon = L.divIcon({
            html: `<div style="
                font-size: 1.8rem;
                filter: drop-shadow(0 3px 8px rgba(0,0,0,0.35));
                animation: float 1.5s ease-in-out infinite;
                transition: transform 0.1s;
            ">🛵</div>`,
            className: '',
            iconSize: [34, 34],
            iconAnchor: [17, 17]
        });

        this.assistantMarker = L.marker(path[0], { icon, zIndexOffset: 1000 }).addTo(this.map);
        const totalPoints = path.length;
        let startTime = null;
        const trailCoords = [path[0]];

        // Create a trail polyline
        const trail = L.polyline(trailCoords, {
            color: '#A855F7',
            weight: 3,
            opacity: 0.5,
            dashArray: '4, 8',
            lineCap: 'round'
        }).addTo(this.map);

        const step = (timestamp) => {
            if (!startTime) startTime = timestamp;
            const progress = Math.min((timestamp - startTime) / duration, 1);
            const easedProgress = Utils.easeOutCubic(progress);
            const idx = Math.min(Math.floor(easedProgress * totalPoints), totalPoints - 1);

            if (path[idx]) {
                this.assistantMarker.setLatLng(path[idx]);

                // Add to trail
                trailCoords.push(path[idx]);
                trail.setLatLngs(trailCoords);

                // Optional follow camera
                if (progress < 0.9) {
                    this.map.panTo(path[idx], { animate: true, duration: 0.3 });
                }
            }

            // Progress callback
            if (typeof onProgress === 'function') {
                onProgress(progress);
            }

            if (progress < 1) {
                requestAnimationFrame(step);
            } else {
                this.assistantMarker.setLatLng(path[totalPoints - 1]);
                // Fade out trail
                setTimeout(() => {
                    if (trail) this.map.removeLayer(trail);
                }, 2000);
                if (typeof onComplete === 'function') onComplete();
            }
        };

        requestAnimationFrame(step);
    }

    // ── Clear Route ──
    clearRoute() {
        if (this.routePolyline) { this.map.removeLayer(this.routePolyline); this.routePolyline = null; }
        if (this.trailPolyline) { this.map.removeLayer(this.trailPolyline); this.trailPolyline = null; }
        if (this.assistantMarker) { this.map.removeLayer(this.assistantMarker); this.assistantMarker = null; }
    }

    // ── Get Map Center ──
    getCenter() {
        const c = this.map.getCenter();
        return { lat: c.lat, lng: c.lng };
    }
}