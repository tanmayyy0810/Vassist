const CONFIG = {
    // 🎯 Center of VIT Vellore
    VIT_CENTER: [12.9716, 79.1594],

    API: {
        OSRM: 'https://router.project-osrm.org/route/v1/walking/'
    },

    PRICING: {
        WALKER: { BASE: 10, PER_KM: 5 },
        CYCLIST: { BASE: 15, PER_KM: 8 }
    },

    KEYS: {
        HISTORY: 'vassist_history',
        ACTIVE_REQ: 'vassist_active_request',
        SETTINGS: 'vassist_settings'
    },

    // App metadata
    APP: {
        NAME: 'VAssist',
        VERSION: '3.0.0',
        AUTHOR: 'Yuvraj Chopra'
    }
};