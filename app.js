/* ============================================
   VAssist — Main Application Controller
   v3.0 — Firebase Realtime DB Backend
   ============================================ */

document.addEventListener('DOMContentLoaded', () => {

    // ==========================================
    // 🚀 CINEMATIC SPLASH SCREEN
    // ==========================================
    const splashEl = document.getElementById('splash-screen');

    const dismissSplash = () => {
        splashEl.classList.add('fade-out');
        setTimeout(() => {
            splashEl.remove();
            initApp();
        }, 800);
    };

    // Show splash for 2.8 seconds then fade out
    setTimeout(dismissSplash, 2800);

    // ==========================================
    // 🎬 APP INITIALIZATION
    // ==========================================
    function initApp() {
        const mapService = new MapService();
        let currentUserMode = 'user';
        let selectedDeliveryType = 'walker';
        let activeRequestId = localStorage.getItem('vassist_active_req_id') || null;

        // ==========================================
        // 📍 LOCATION & MAP LOGIC
        // ==========================================

        function locateUser() {
            const dropInput = document.getElementById('drop-input');
            dropInput.value = "🔍 Detecting GPS...";

            if (!navigator.geolocation) {
                fallbackLocation(dropInput);
                return;
            }

            navigator.geolocation.getCurrentPosition(
                (pos) => {
                    const { latitude, longitude } = pos.coords;
                    STATE.drop = { lat: latitude, lng: longitude };
                    mapService.setUserLocation(latitude, longitude);
                    dropInput.value = "📍 My Current Location";
                    Utils.showToast("✅ GPS Location Found");
                    Utils.vibrate(50);
                    validateRequestForm();
                },
                (err) => {
                    console.warn("GPS failed:", err.message);
                    fallbackLocation(dropInput);
                },
                {
                    enableHighAccuracy: true,
                    timeout: 8000,
                    maximumAge: 60000
                }
            );
        }

        function fallbackLocation(dropInput) {
            const [lat, lng] = CONFIG.VIT_CENTER;
            STATE.drop = { lat, lng };
            mapService.setUserLocation(lat, lng);
            dropInput.value = "📍 VIT Campus (Default)";
            Utils.showToast("📍 Using Campus Center as default", 4000);
            validateRequestForm();
        }

        // Locate on init
        locateUser();

        // "Locate Me" FAB
        const locateBtn = document.getElementById('locate-btn');
        locateBtn.addEventListener('click', (e) => {
            Utils.createRipple(e, locateBtn);
            locateUser();
        });

        // ---- Map Click -> Pickup Selection ----
        mapService.map.on('click', (e) => {
            if (currentUserMode !== 'user') return;

            const { lat, lng } = e.latlng;
            STATE.pickup = { lat, lng };
            mapService.addMarker('store', lat, lng);
            document.getElementById('pickup-input').value = `📍 Custom Pin (${lat.toFixed(4)}, ${lng.toFixed(4)})`;
            validateRequestForm();
            Utils.vibrate(20);
        });

        // ---- Campus Location Selection ----
        document.addEventListener('location-selected', (e) => {
            if (currentUserMode !== 'user') return;

            const loc = e.detail;
            if (loc.type === 'store' || loc.type === 'amenity' || loc.type === 'academic') {
                STATE.pickup = { lat: loc.lat, lng: loc.lng };
                document.getElementById('pickup-input').value = `🏪 ${loc.name}`;
                mapService.addMarker('store', loc.lat, loc.lng);
                Utils.showToast(`📍 Pickup: ${loc.name}`);
            } else {
                STATE.drop = { lat: loc.lat, lng: loc.lng };
                document.getElementById('drop-input').value = `🏠 ${loc.name}`;
                mapService.addMarker('user', loc.lat, loc.lng);
                Utils.showToast(`📍 Drop: ${loc.name}`);
            }
            validateRequestForm();
        });

        // ==========================================
        // 🔄 USER MODE — Request Flow
        // ==========================================

        const itemInput = document.getElementById('item-input');
        const findBtn = document.getElementById('find-assist-btn');

        itemInput.addEventListener('input', Utils.debounce(validateRequestForm, 150));

        function validateRequestForm() {
            const valid = STATE.pickup && itemInput.value.trim() !== '';
            findBtn.disabled = !valid;

            if (valid && !findBtn.dataset.wasEnabled) {
                findBtn.dataset.wasEnabled = 'true';
                findBtn.style.animation = 'bounce-in 0.4s cubic-bezier(0.68, -0.55, 0.265, 1.55)';
                setTimeout(() => findBtn.style.animation = '', 400);
            } else if (!valid) {
                findBtn.dataset.wasEnabled = '';
            }
        }

        // ---- Find Assistant ----
        findBtn.addEventListener('click', async (e) => {
            if (!STATE.pickup || !STATE.drop) {
                Utils.showToast("⚠️ Select both locations first");
                findBtn.classList.add('animate-shake');
                setTimeout(() => findBtn.classList.remove('animate-shake'), 400);
                return;
            }

            Utils.createRipple(e, findBtn);
            Utils.vibrate(30);

            // Loading state
            findBtn.innerHTML = '<span class="btn-loader"></span> Calculating Route...';
            findBtn.disabled = true;

            const route = await mapService.drawRoute(STATE.pickup, STATE.drop);

            if (route) {
                STATE.route = route;

                const walkerPrice = Pricing.estimate(route.dist, 'walker');
                const cyclistPrice = Pricing.estimate(route.dist, 'cyclist');

                Utils.animateNumber(document.getElementById('price-walker'), walkerPrice);
                Utils.animateNumber(document.getElementById('price-cyclist'), cyclistPrice);

                UI.showPanel('mode');
                Utils.showToast(`📏 ${route.dist.toFixed(1)} km • ~${route.duration || Math.round(route.dist * 12)} min`);
            } else {
                Utils.showToast("⚠️ Couldn't find a route. Try different locations.");
            }

            findBtn.innerHTML = 'Find Assistant <span class="arrow">→</span>';
            findBtn.disabled = false;
            validateRequestForm();
        });

        // ---- Option Card Selection ----
        document.querySelectorAll('.option-card').forEach(card => {
            card.addEventListener('click', () => {
                document.querySelectorAll('.option-card').forEach(c => c.classList.remove('selected'));
                card.classList.add('selected');
                selectedDeliveryType = card.dataset.type;
                Utils.vibrate(15);
            });
        });

        // ---- Back Button ----
        document.getElementById('back-to-request').addEventListener('click', () => {
            UI.showPanel('request');
        });

        // ---- Confirm Request → Send to Backend ----
        document.getElementById('confirm-btn').addEventListener('click', async (e) => {
            Utils.createRipple(e, e.currentTarget);
            Utils.vibrate(50);

            const confirmBtn = e.currentTarget;
            confirmBtn.innerHTML = '<span class="btn-loader"></span> Broadcasting...';
            confirmBtn.disabled = true;

            const priceEl = selectedDeliveryType === 'cyclist'
                ? document.getElementById('price-cyclist')
                : document.getElementById('price-walker');

            const otp = Utils.generateOTP();
            const requestData = {
                id: Utils.generateId(),
                item: itemInput.value,
                pickup: document.getElementById('pickup-input').value,
                drop_location: document.getElementById('drop-input').value,
                pickup_lat: STATE.pickup?.lat,
                pickup_lng: STATE.pickup?.lng,
                drop_lat: STATE.drop?.lat,
                drop_lng: STATE.drop?.lng,
                fare: priceEl.innerText,
                delivery_type: selectedDeliveryType,
                otp: String(otp)
            };

            try {
                await API.createRequest(requestData);

                // Save request ID locally for tracking
                activeRequestId = requestData.id;
                localStorage.setItem('vassist_active_req_id', activeRequestId);

                // Show tracking panel
                UI.showPanel('track');
                document.getElementById('track-status').innerText = "Broadcasting to nearby students...";
                document.getElementById('otp-display').innerText = otp;

                Utils.showToast("📡 Request Broadcasted to Campus!");

                // Start real-time tracking (Firebase listener)
                startUserTracking(activeRequestId);

            } catch (err) {
                Utils.showToast("⚠️ Failed to send request. Please try again.");
                console.error('Request creation failed:', err);
            }

            confirmBtn.innerHTML = 'Request Now <span class="arrow">→</span>';
            confirmBtn.disabled = false;
        });

        // ==========================================
        // 📡 USER TRACKING — Firebase Real-Time
        // ==========================================

        let unsubUserTracking = null;

        function startUserTracking(requestId) {
            stopUserTracking();
            let lastStatus = 'PENDING';

            unsubUserTracking = API.onRequestUpdate(requestId, (req) => {
                if (!req) return;
                if (req.status !== lastStatus) {
                    lastStatus = req.status;
                    handleUserStatusUpdate(req);
                }
            });
        }

        function stopUserTracking() {
            if (unsubUserTracking) { unsubUserTracking(); unsubUserTracking = null; }
        }

        function handleUserStatusUpdate(req) {
            if (req.status === 'ACCEPTED') {
                handleRequestAccepted(req);
            } else if (req.status === 'PICKED_UP') {
                updateTimelineStep(2, 'completed');
                updateTimelineStep(3, 'active');
                document.getElementById('ast-status').innerText = "Picked up item, heading to you!";
                Utils.showToast("📦 Item Picked Up!");
            } else if (req.status === 'DELIVERING') {
                updateTimelineStep(3, 'completed');
                updateTimelineStep(4, 'active');
                document.getElementById('ast-status').innerText = "Almost there!";
            } else if (req.status === 'DELIVERED') {
                updateTimelineStep(4, 'completed');
                document.getElementById('ast-status').innerText = "✅ Delivered!";
                Utils.showToast("🎉 Order Delivered!");
                Utils.launchConfetti(50);
                Utils.vibrate([100, 50, 100, 50, 200]);
                stopUserTracking();

                // Clear active request
                localStorage.removeItem('vassist_active_req_id');
                activeRequestId = null;

                // Auto reset after 8 seconds
                setTimeout(() => {
                    UI.showPanel('request');
                    resetTrackingUI();
                }, 8000);
            }
        }

        function handleRequestAccepted(req) {
            const radarSection = document.getElementById('radar-section');
            radarSection.classList.add('hidden');

            const assignedInfo = document.getElementById('assigned-info');
            assignedInfo.classList.remove('hidden');
            assignedInfo.style.animation = 'card-slide-up 0.5s var(--ease-spring) both';

            document.getElementById('ast-name').innerText = req.partner_name || 'Partner';
            document.getElementById('ast-status').innerText = "Accepted & Heading to store";

            const timeline = document.getElementById('delivery-timeline');
            timeline.classList.remove('hidden');
            timeline.style.animation = 'slide-in-up 0.5s var(--ease-spring) 0.3s both';

            Utils.showToast("🎉 Partner Found!");
            Utils.vibrate([50, 30, 50]);

            // Animate assistant on map if route exists
            if (STATE.route && STATE.route.coords) {
                mapService.animateAssistant(STATE.route.coords, 15000, null, null);
            }
        }

        function resetTrackingUI() {
            document.getElementById('radar-section').classList.remove('hidden');
            document.getElementById('assigned-info').classList.add('hidden');
            document.getElementById('delivery-timeline').classList.add('hidden');
            document.getElementById('track-status').innerText = "Looking for nearby students...";

            // Reset timeline steps
            for (let i = 1; i <= 4; i++) {
                const step = document.getElementById(`step-${i}`);
                if (step) {
                    step.classList.remove('active', 'completed');
                    if (i === 1) step.classList.add('completed');
                    if (i === 2) step.classList.add('active');
                }
            }
        }

        function updateTimelineStep(stepNum, status) {
            const step = document.getElementById(`step-${stepNum}`);
            if (!step) return;

            step.classList.remove('active', 'completed');
            step.classList.add(status);

            if (status === 'completed') {
                step.querySelector('.step-indicator').innerHTML = '✓';
            }
        }

        // ==========================================
        // 🎒 PARTNER MODE — Real-Time Dashboard
        // ==========================================

        let acceptedRequestId = null;
        let unsubPartnerRequests = null;

        function startPartnerListening() {
            stopPartnerListening();
            unsubPartnerRequests = API.onPendingRequests((requests) => {
                renderPartnerRequests(requests);
            });
        }

        function stopPartnerListening() {
            if (unsubPartnerRequests) { unsubPartnerRequests(); unsubPartnerRequests = null; }
        }

        function renderPartnerRequests(requests) {
            const container = document.getElementById('requests-list');

            // If partner has accepted an order, don't overwrite with pending list
            if (acceptedRequestId) return;

            if (!requests || requests.length === 0) {
                container.innerHTML = `
                    <div class="empty-state">
                        <p>No active requests nearby.</p>
                        <small>Wait for a notification... Refreshing every 3s</small>
                    </div>
                `;
                return;
            }

            container.innerHTML = requests.map(req => `
                <div class="req-card animate-pop">
                    <div class="req-header">
                        <span>📦 ${req.item}</span>
                        <span style="color: var(--accent-green)">₹${req.fare}</span>
                    </div>
                    <div class="req-route">
                        <strong>From:</strong> ${req.pickup}<br>
                        <strong>To:</strong> ${req.drop_location}
                    </div>
                    <div class="req-meta">
                        <span>🚶 ${req.delivery_type}</span>
                        <span>${Utils.timeAgo(req.created_at)}</span>
                    </div>
                    <button class="accept-btn" data-id="${req.id}">
                        🚀 Accept Order
                    </button>
                </div>
            `).join('');

            // Attach click handlers
            container.querySelectorAll('.accept-btn').forEach(btn => {
                btn.addEventListener('click', () => {
                    acceptRequestFromPartner(btn.dataset.id);
                });
            });

            if (requests.length > 0) {
                Utils.vibrate([50, 30, 50]);
            }
        }

        async function acceptRequestFromPartner(reqId) {
            const btn = document.querySelector(`[data-id="${reqId}"]`);
            if (btn) {
                btn.innerHTML = '<span class="btn-loader"></span> Accepting...';
                btn.disabled = true;
            }

            try {
                const partnerName = prompt("Enter your name:") || "Campus Partner";
                await API.acceptRequest(reqId, partnerName);

                acceptedRequestId = reqId;

                document.getElementById('requests-list').innerHTML = `
                    <div class="accepted-order-card animate-pop">
                        <div class="accepted-header">
                            <span>✅ Order Accepted!</span>
                        </div>
                        <p>Head to the store to pick up the item.</p>

                        <div class="partner-actions">
                            <button class="action-btn picked-up-btn" id="btn-picked-up">
                                📦 Mark as Picked Up
                            </button>
                            <button class="action-btn deliver-btn" id="btn-deliver" disabled>
                                🚀 Mark Delivering
                            </button>
                            <button class="action-btn complete-btn" id="btn-complete" disabled>
                                ✅ Mark Delivered (Enter OTP)
                            </button>
                        </div>
                    </div>
                `;

                // Setup partner action buttons
                setupPartnerActions(reqId);

                Utils.showToast("✅ Order Accepted! Head to store.");
                Utils.vibrate(100);

            } catch (err) {
                Utils.showToast("⚠️ Could not accept — may already be taken.");
                if (btn) {
                    btn.innerHTML = '🚀 Accept Order';
                    btn.disabled = false;
                }
            }
        }

        function setupPartnerActions(reqId) {
            const pickedBtn = document.getElementById('btn-picked-up');
            const deliverBtn = document.getElementById('btn-deliver');
            const completeBtn = document.getElementById('btn-complete');

            pickedBtn.addEventListener('click', async () => {
                await API.updateStatus(reqId, 'PICKED_UP');
                pickedBtn.disabled = true;
                pickedBtn.classList.add('done');
                pickedBtn.innerHTML = '✓ Picked Up';
                deliverBtn.disabled = false;
                Utils.showToast("📦 Marked as Picked Up");
                Utils.vibrate(50);
            });

            deliverBtn.addEventListener('click', async () => {
                await API.updateStatus(reqId, 'DELIVERING');
                deliverBtn.disabled = true;
                deliverBtn.classList.add('done');
                deliverBtn.innerHTML = '✓ On the Way';
                completeBtn.disabled = false;
                Utils.showToast("🚀 Delivering...");
                Utils.vibrate(50);
            });

            completeBtn.addEventListener('click', () => {
                showOTPModal(reqId);
            });
        }

        // ==========================================
        // 🔐 OTP VERIFICATION MODAL
        // ==========================================

        function showOTPModal(reqId) {
            const modal = document.getElementById('otp-modal');
            const inputs = modal.querySelectorAll('.otp-digit');
            const errorEl = document.getElementById('otp-error');
            const verifyBtn = document.getElementById('otp-verify-btn');

            modal.classList.add('show');
            errorEl.textContent = '';

            // Clear inputs
            inputs.forEach(inp => { inp.value = ''; });
            inputs[0].focus();

            // Auto-tab between digits
            inputs.forEach((input, idx) => {
                input.addEventListener('input', () => {
                    if (input.value && idx < inputs.length - 1) {
                        inputs[idx + 1].focus();
                    }
                });
                input.addEventListener('keydown', (e) => {
                    if (e.key === 'Backspace' && !input.value && idx > 0) {
                        inputs[idx - 1].focus();
                    }
                });
            });

            // Verify button
            const handleVerify = async () => {
                const otp = Array.from(inputs).map(i => i.value).join('');
                if (otp.length !== 4) {
                    errorEl.textContent = 'Please enter all 4 digits';
                    modal.querySelector('.otp-input-row').classList.add('animate-shake');
                    setTimeout(() => modal.querySelector('.otp-input-row').classList.remove('animate-shake'), 400);
                    return;
                }

                verifyBtn.innerHTML = '<span class="btn-loader"></span> Verifying...';
                verifyBtn.disabled = true;

                const result = await API.verifyOTP(reqId, otp);

                if (result.ok && result.success) {
                    modal.classList.remove('show');
                    Utils.showToast("🎉 Delivery Complete!");
                    Utils.launchConfetti(60);
                    Utils.vibrate([100, 50, 100, 50, 200]);

                    // Reset partner UI
                    acceptedRequestId = null;
                    document.getElementById('requests-list').innerHTML = `
                        <div class="empty-state" style="animation: bounce-in 0.5s var(--ease-spring) both;">
                            <p>🎉 Delivery Complete!</p>
                            <small>Great job! Waiting for next order...</small>
                        </div>
                    `;
                } else {
                    errorEl.textContent = '❌ Wrong OTP — try again';
                    inputs.forEach(i => { i.value = ''; });
                    inputs[0].focus();
                    modal.querySelector('.otp-input-row').classList.add('animate-shake');
                    setTimeout(() => modal.querySelector('.otp-input-row').classList.remove('animate-shake'), 400);
                }

                verifyBtn.innerHTML = 'Verify OTP';
                verifyBtn.disabled = false;
            };

            verifyBtn.onclick = handleVerify;

            // Close modal
            document.getElementById('otp-close-btn').onclick = () => {
                modal.classList.remove('show');
            };
        }

        // ==========================================
        // 🔀 MODE SWITCHING — Smooth Transition
        // ==========================================
        const modeToggle = document.getElementById('mode-toggle');
        const labelUser = document.getElementById('label-user');
        const labelPartner = document.getElementById('label-partner');

        modeToggle.addEventListener('change', () => {
            Utils.vibrate(40);

            if (modeToggle.checked) {
                // → Partner Mode
                currentUserMode = 'partner';
                labelUser.style.color = 'var(--text-muted)';
                labelPartner.style.color = 'var(--primary)';

                const userUI = document.getElementById('user-ui');
                userUI.style.animation = 'slide-in-left 0.4s ease reverse forwards';
                setTimeout(() => {
                    userUI.classList.add('hidden-mode');
                    userUI.style.animation = '';

                    const partnerUI = document.getElementById('partner-ui');
                    partnerUI.classList.remove('hidden-mode');
                    partnerUI.style.animation = 'slide-in-right 0.4s var(--ease-spring) both';
                }, 350);

                // Start real-time listener for partner requests
                startPartnerListening();
                Utils.showToast("🎒 Switched to Partner Mode");

            } else {
                // → User Mode
                currentUserMode = 'user';
                labelUser.style.color = 'var(--primary)';
                labelPartner.style.color = 'var(--text-muted)';

                const partnerUI = document.getElementById('partner-ui');
                partnerUI.style.animation = 'slide-in-right 0.4s ease reverse forwards';
                setTimeout(() => {
                    partnerUI.classList.add('hidden-mode');
                    partnerUI.style.animation = '';

                    const userUI = document.getElementById('user-ui');
                    userUI.classList.remove('hidden-mode');
                    userUI.style.animation = 'slide-in-left 0.4s var(--ease-spring) both';
                }, 350);

                // Stop partner listener
                stopPartnerListening();
                acceptedRequestId = null;

                Utils.showToast("👤 Switched to User Mode");
            }
        });

        // ==========================================
        // 🔄 RESUME — Check for active request on load
        // ==========================================
        if (activeRequestId) {
            // User had an active request, resume tracking
            UI.showPanel('track');
            startUserTracking(activeRequestId);
            Utils.showToast("📡 Resuming order tracking...");
        }

        // ==========================================
        // ✨ GLOBAL ENHANCEMENTS
        // ==========================================

        document.querySelectorAll('.primary-btn, .accept-btn').forEach(btn => {
            btn.addEventListener('click', (e) => Utils.createRipple(e, btn));
        });

        document.querySelectorAll('.input-wrapper input, .loc-row input').forEach(input => {
            input.addEventListener('focus', () => {
                const wrapper = input.closest('.input-wrapper') || input.closest('.loc-row');
                if (wrapper) wrapper.style.transform = 'scale(1.01)';
            });
            input.addEventListener('blur', () => {
                const wrapper = input.closest('.input-wrapper') || input.closest('.loc-row');
                if (wrapper) wrapper.style.transform = '';
            });
        });

        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                // Close OTP modal if open
                const modal = document.getElementById('otp-modal');
                if (modal && modal.classList.contains('show')) {
                    modal.classList.remove('show');
                    return;
                }
                const activePanel = document.querySelector('.panel.active');
                if (activePanel && activePanel.id !== 'request-panel') {
                    UI.showPanel('request');
                }
            }
        });

    } // end initApp()
});


// ==========================================
// 🔧 GLOBAL UI CONTROLLER
// ==========================================
const UI = {
    showPanel: (id) => {
        document.querySelectorAll('.panel').forEach(p => {
            p.classList.remove('active');
        });

        const target = document.getElementById(id + '-panel');
        if (target) {
            requestAnimationFrame(() => {
                target.classList.add('active');
            });
        }
    }
};

// ==========================================
// 📦 GLOBAL STATE
// ==========================================
const STATE = {
    pickup: null,
    drop: null,
    route: null
};