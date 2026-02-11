import { neon } from '@neondatabase/serverless';

export default async (req) => {
    try {
        const sql = neon(process.env.DATABASE_URL);
        const url = new URL(req.url);
        const id = url.searchParams.get('id');
        const status = url.searchParams.get('status');

        // Auto-create table if not exists
        await sql`
            CREATE TABLE IF NOT EXISTS requests (
                id TEXT PRIMARY KEY,
                item TEXT NOT NULL,
                pickup TEXT NOT NULL,
                drop_location TEXT NOT NULL,
                pickup_lat DOUBLE PRECISION,
                pickup_lng DOUBLE PRECISION,
                drop_lat DOUBLE PRECISION,
                drop_lng DOUBLE PRECISION,
                fare TEXT,
                delivery_type TEXT DEFAULT 'walker',
                otp TEXT NOT NULL,
                status TEXT DEFAULT 'PENDING',
                partner_name TEXT,
                created_at TIMESTAMP DEFAULT NOW(),
                updated_at TIMESTAMP DEFAULT NOW()
            )
        `;

        let results;

        if (id) {
            // Get specific request by ID (for user tracking — OTP excluded for security)
            results = await sql`
                SELECT id, item, pickup, drop_location, pickup_lat, pickup_lng, drop_lat, drop_lng,
                       fare, delivery_type, status, partner_name, created_at, updated_at
                FROM requests WHERE id = ${id}
            `;
            if (results.length === 0) {
                return new Response(JSON.stringify({ error: 'Request not found' }), {
                    status: 404,
                    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
                });
            }
            return new Response(JSON.stringify(results[0]), {
                headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
            });
        }

        // Get all requests by status (default: PENDING) — for partner dashboard
        const filterStatus = status || 'PENDING';
        results = await sql`
            SELECT id, item, pickup, drop_location, pickup_lat, pickup_lng, drop_lat, drop_lng,
                   fare, delivery_type, status, partner_name, created_at
            FROM requests
            WHERE status = ${filterStatus}
            ORDER BY created_at DESC
            LIMIT 20
        `;

        return new Response(JSON.stringify(results), {
            headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
        });
    } catch (error) {
        console.error('Get requests error:', error);
        return new Response(JSON.stringify({ error: 'Failed to fetch requests' }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' }
        });
    }
};

export const config = {
    path: '/api/get-requests'
};
