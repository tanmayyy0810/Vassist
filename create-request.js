import { neon } from '@neondatabase/serverless';

export default async (req) => {
    if (req.method !== 'POST') {
        return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers: { 'Content-Type': 'application/json' } });
    }

    try {
        const sql = neon(process.env.DATABASE_URL);
        const body = await req.json();

        const { id, item, pickup, drop_location, pickup_lat, pickup_lng, drop_lat, drop_lng, fare, delivery_type, otp } = body;

        if (!id || !item || !pickup || !drop_location || !otp) {
            return new Response(JSON.stringify({ error: 'Missing required fields' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
        }

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

        await sql`
            INSERT INTO requests (id, item, pickup, drop_location, pickup_lat, pickup_lng, drop_lat, drop_lng, fare, delivery_type, otp, status)
            VALUES (${id}, ${item}, ${pickup}, ${drop_location}, ${pickup_lat || null}, ${pickup_lng || null}, ${drop_lat || null}, ${drop_lng || null}, ${fare || '0'}, ${delivery_type || 'walker'}, ${otp}, 'PENDING')
        `;

        return new Response(JSON.stringify({ success: true, id }), {
            status: 201,
            headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
        });
    } catch (error) {
        console.error('Create request error:', error);
        return new Response(JSON.stringify({ error: 'Failed to create request' }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' }
        });
    }
};

export const config = {
    path: '/api/create-request'
};
