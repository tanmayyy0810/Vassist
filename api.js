/* ============================================
   VAssist — Local REST API Service
   Talks to Python server at localhost:8000
   Replaces Firebase Firestore with polling
   ============================================ */

const API_BASE = window.location.origin + '/api';

const API = {
    // ── Create a new delivery request ──
    createRequest: async (data) => {
        try {
            const resp = await fetch(`${API_BASE}/create-request`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data)
            });
            const result = await resp.json();
            if (!resp.ok) throw new Error(result.error || 'Failed to create request');
            return { success: true, id: data.id };
        } catch (err) {
            console.error('API.createRequest error:', err);
            throw err;
        }
    },

    // ── Accept a request (partner side) ──
    acceptRequest: async (id, partnerName) => {
        try {
            const resp = await fetch(`${API_BASE}/accept-request`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id, partner_name: partnerName })
            });
            const result = await resp.json();
            if (!resp.ok) throw new Error(result.error || 'Already accepted');
            return { success: true };
        } catch (err) {
            console.error('API.acceptRequest error:', err);
            throw err;
        }
    },

    // ── Verify OTP → mark as delivered ──
    verifyOTP: async (id, otp) => {
        try {
            const resp = await fetch(`${API_BASE}/verify-otp`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id, otp: String(otp) })
            });
            const result = await resp.json();
            if (resp.ok && result.success) {
                return { ok: true, success: true };
            }
            return { ok: false, success: false, error: result.error || 'Invalid OTP' };
        } catch (err) {
            console.error('API.verifyOTP error:', err);
            return { ok: false, error: 'Network error' };
        }
    },

    // ── Update request status ──
    updateStatus: async (id, status) => {
        try {
            const resp = await fetch(`${API_BASE}/update-status`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id, status })
            });
            const result = await resp.json();
            if (!resp.ok) return null;
            return { success: true };
        } catch (err) {
            console.error('API.updateStatus error:', err);
            return null;
        }
    },

    // ═══ POLLING-BASED LISTENERS (replaces Firebase onSnapshot) ═══
    _intervals: {},

    // Poll for a specific request update (user tracking their order)
    onRequestUpdate: (id, callback) => {
        API.stopListener('req_' + id);

        // Poll immediately, then every 2 seconds
        const poll = async () => {
            try {
                const resp = await fetch(`${API_BASE}/poll?id=${encodeURIComponent(id)}`);
                const data = await resp.json();
                callback(data);
            } catch (err) {
                console.warn('Polling error:', err);
            }
        };

        poll(); // Immediate first poll
        const interval = setInterval(poll, 2000);
        API._intervals['req_' + id] = interval;

        // Return unsubscribe function (matches Firebase API)
        return () => {
            clearInterval(interval);
            delete API._intervals['req_' + id];
        };
    },

    // Poll for all pending requests (partner dashboard)
    onPendingRequests: (callback) => {
        API.stopListener('pending');

        const poll = async () => {
            try {
                const resp = await fetch(`${API_BASE}/get-requests?status=PENDING`);
                const data = await resp.json();
                callback(Array.isArray(data) ? data : []);
            } catch (err) {
                console.warn('Pending requests poll error:', err);
                callback([]);
            }
        };

        poll(); // Immediate first poll
        const interval = setInterval(poll, 3000);
        API._intervals['pending'] = interval;

        return () => {
            clearInterval(interval);
            delete API._intervals['pending'];
        };
    },

    stopListener: (name) => {
        if (API._intervals[name]) {
            clearInterval(API._intervals[name]);
            delete API._intervals[name];
        }
    },

    stopAllListeners: () => {
        Object.values(API._intervals).forEach(interval => clearInterval(interval));
        API._intervals = {};
    }
};
