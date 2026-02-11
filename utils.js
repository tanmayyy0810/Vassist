/* ============================================
   VAssist — Utilities, Pricing & Animation Helpers
   ============================================ */

// ── Pricing Engine ──
const Pricing = {
    estimate: (distKm, type) => {
        const pricing = type === 'cyclist' ? CONFIG.PRICING.CYCLIST : CONFIG.PRICING.WALKER;
        const raw = pricing.BASE + (distKm * pricing.PER_KM);

        // Surge pricing check
        const settings = Utils.getSettings();
        let multiplier = 1;
        if (settings.surge) multiplier += 0.3;
        if (settings.rain) multiplier += 0.2;

        return Math.round(raw * multiplier);
    }
};

// ── Core Utilities ──
const Utils = {
    formatCurrency: (amt) => `₹${Math.round(amt)}`,

    generateId: () => 'REQ_' + Date.now().toString(36).toUpperCase() + '_' + Math.random().toString(36).substr(2, 4).toUpperCase(),

    generateOTP: () => Math.floor(1000 + Math.random() * 9000),

    getSettings: () => JSON.parse(localStorage.getItem(CONFIG.KEYS.SETTINGS)) || { surge: false, rain: false },

    saveRide: (ride) => {
        const rides = JSON.parse(localStorage.getItem(CONFIG.KEYS.HISTORY) || '[]');
        rides.unshift(ride);
        if (rides.length > 50) rides.length = 50; // Cap history
        localStorage.setItem(CONFIG.KEYS.HISTORY, JSON.stringify(rides));
    },

    // ── Enhanced Toast ──
    showToast: (msg, duration = 3000) => {
        const t = document.getElementById('toast');
        t.innerText = msg;
        t.classList.add('show');
        t.classList.remove('hidden');

        // Clear any existing timeout
        if (Utils._toastTimer) clearTimeout(Utils._toastTimer);

        Utils._toastTimer = setTimeout(() => {
            t.classList.remove('show');
            setTimeout(() => t.classList.add('hidden'), 400);
        }, duration);
    },
    _toastTimer: null,

    // ── Debounce ──
    debounce: (fn, ms = 300) => {
        let timer;
        return (...args) => {
            clearTimeout(timer);
            timer = setTimeout(() => fn.apply(null, args), ms);
        };
    },

    // ── Throttle ──
    throttle: (fn, limit = 100) => {
        let waiting = false;
        return (...args) => {
            if (!waiting) {
                fn.apply(null, args);
                waiting = true;
                setTimeout(() => { waiting = false; }, limit);
            }
        };
    },

    // ── Smooth Number Counter ──
    animateNumber: (element, target, duration = 600) => {
        const start = parseInt(element.innerText) || 0;
        const diff = target - start;
        const startTime = performance.now();

        const step = (now) => {
            const elapsed = now - startTime;
            const progress = Math.min(elapsed / duration, 1);
            // Ease out cubic
            const eased = 1 - Math.pow(1 - progress, 3);
            element.innerText = Math.round(start + diff * eased);
            if (progress < 1) requestAnimationFrame(step);
        };
        requestAnimationFrame(step);
    },

    // ── Ripple Effect Creator ──
    createRipple: (event, element) => {
        const circle = document.createElement('span');
        const diameter = Math.max(element.clientWidth, element.clientHeight);
        const radius = diameter / 2;
        const rect = element.getBoundingClientRect();

        circle.style.width = circle.style.height = `${diameter}px`;
        circle.style.left = `${event.clientX - rect.left - radius}px`;
        circle.style.top = `${event.clientY - rect.top - radius}px`;
        circle.classList.add('ripple');

        // Remove old ripples
        const existingRipple = element.querySelector('.ripple');
        if (existingRipple) existingRipple.remove();

        element.appendChild(circle);
        setTimeout(() => circle.remove(), 600);
    },

    // ── Confetti Celebration ──
    launchConfetti: (count = 40) => {
        const container = document.createElement('div');
        container.className = 'confetti-container';
        document.body.appendChild(container);

        const colors = ['#6C63FF', '#A855F7', '#EC4899', '#2ED573', '#FFA502', '#18DCFF', '#FF4757'];

        for (let i = 0; i < count; i++) {
            const piece = document.createElement('div');
            piece.className = 'confetti-piece';
            piece.style.left = Math.random() * 100 + '%';
            piece.style.background = colors[Math.floor(Math.random() * colors.length)];
            piece.style.animationDuration = (2 + Math.random() * 2) + 's';
            piece.style.animationDelay = Math.random() * 0.5 + 's';
            piece.style.width = (6 + Math.random() * 8) + 'px';
            piece.style.height = (6 + Math.random() * 8) + 'px';
            piece.style.borderRadius = Math.random() > 0.5 ? '50%' : '2px';
            container.appendChild(piece);
        }

        setTimeout(() => container.remove(), 4000);
    },

    // ── Lerp (Linear Interpolation) ──
    lerp: (a, b, t) => a + (b - a) * t,

    // ── Easing Functions ──
    easeOutCubic: (t) => 1 - Math.pow(1 - t, 3),
    easeInOutQuad: (t) => t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2,
    easeOutElastic: (t) => {
        const c4 = (2 * Math.PI) / 3;
        return t === 0 ? 0 : t === 1 ? 1 : Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * c4) + 1;
    },

    // ── Random Between ──
    randomBetween: (min, max) => Math.random() * (max - min) + min,

    // ── Haptic Feedback (if supported) ──
    vibrate: (pattern = 50) => {
        if ('vibrate' in navigator) navigator.vibrate(pattern);
    },

    // ── Format Time ──
    formatTime: (ms) => {
        const minutes = Math.floor(ms / 60000);
        const seconds = Math.floor((ms % 60000) / 1000);
        return `${minutes}m ${seconds}s`;
    },

    // ── Time Ago (for partner dashboard) ──
    timeAgo: (val) => {
        const now = Date.now();
        let then;
        if (val && typeof val.toDate === 'function') {
            then = val.toDate().getTime(); // Firestore Timestamp
        } else if (typeof val === 'number') {
            then = val; // milliseconds
        } else {
            then = new Date(val).getTime(); // date string
        }
        const diff = Math.max(0, now - then);
        const mins = Math.floor(diff / 60000);
        if (mins < 1) return 'Just now';
        if (mins < 60) return `${mins}m ago`;
        const hrs = Math.floor(mins / 60);
        return `${hrs}h ago`;
    }
};