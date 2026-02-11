/* ═══════════════════════════════════════════════
   ⚡ VAssist — LOCAL MODE (Firebase Disabled)
   Running against local Python server
   ═══════════════════════════════════════════════ */

// Firebase SDK is loaded but NOT initialized — we use local REST API instead.
// This avoids Firebase connection errors while keeping the SDK scripts harmless.

console.log('⚡ VAssist running in LOCAL mode — Python server backend');
console.log('🌐 API Base: http://localhost:8000/api/');

// Create a dummy db object so any leftover references don't crash
const db = null;
