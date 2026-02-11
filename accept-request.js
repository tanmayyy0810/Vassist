import { neon } from '@neondatabase/serverless';

export default async (req) => {
    if (req.method !== 'POST') {
        return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers: { 'Content-Type': 'application/json' } });
    }

    try {
        const sql = neon(process.env.DATABASE_URL);
        const { id, partner_name } = await req.json();

        if (!id || !partner_name) {
            return new Response(JSON.stringify({ error: 'Missing id or partner_name' }), {
                status: 400,
                headers: { 'Content-Type': 'application/json' }
            });
        }

        // Only accept if still PENDING
        const result = await sql`
            UPDATE requests
            SET status = 'ACCEPTED', partner_name = ${partner_name}, updated_at = NOW()
            WHERE id = ${id} AND status = 'PENDING'
            RETURNING id, status, partner_name
        `;

        if (result.length === 0) {
            return new Response(JSON.stringify({ error: 'Request not found or already accepted' }), {
                status: 409,
                headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
            });
        }

        return new Response(JSON.stringify({ success: true, ...result[0] }), {
            headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
        });
    } catch (error) {
        console.error('Accept request error:', error);
        return new Response(JSON.stringify({ error: 'Failed to accept request' }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' }
        });
    }
};

export const config = {
    path: '/api/accept-request'
};
