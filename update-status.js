import { neon } from '@neondatabase/serverless';

export default async (req) => {
    if (req.method !== 'POST') {
        return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers: { 'Content-Type': 'application/json' } });
    }

    try {
        const sql = neon(process.env.DATABASE_URL);
        const { id, status } = await req.json();

        if (!id || !status) {
            return new Response(JSON.stringify({ error: 'Missing id or status' }), {
                status: 400,
                headers: { 'Content-Type': 'application/json' }
            });
        }

        const validStatuses = ['PENDING', 'ACCEPTED', 'PICKED_UP', 'DELIVERING', 'DELIVERED', 'CANCELLED'];
        if (!validStatuses.includes(status)) {
            return new Response(JSON.stringify({ error: 'Invalid status' }), {
                status: 400,
                headers: { 'Content-Type': 'application/json' }
            });
        }

        const result = await sql`
            UPDATE requests
            SET status = ${status}, updated_at = NOW()
            WHERE id = ${id}
            RETURNING id, status
        `;

        if (result.length === 0) {
            return new Response(JSON.stringify({ error: 'Request not found' }), {
                status: 404,
                headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
            });
        }

        return new Response(JSON.stringify({ success: true, ...result[0] }), {
            headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
        });
    } catch (error) {
        console.error('Update status error:', error);
        return new Response(JSON.stringify({ error: 'Failed to update status' }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' }
        });
    }
};

export const config = {
    path: '/api/update-status'
};
