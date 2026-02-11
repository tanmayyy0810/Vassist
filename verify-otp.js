import { neon } from '@neondatabase/serverless';

export default async (req) => {
    if (req.method !== 'POST') {
        return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers: { 'Content-Type': 'application/json' } });
    }

    try {
        const sql = neon(process.env.DATABASE_URL);
        const { id, otp } = await req.json();

        if (!id || !otp) {
            return new Response(JSON.stringify({ error: 'Missing id or otp' }), {
                status: 400,
                headers: { 'Content-Type': 'application/json' }
            });
        }

        // Fetch stored OTP
        const result = await sql`
            SELECT otp, status FROM requests WHERE id = ${id}
        `;

        if (result.length === 0) {
            return new Response(JSON.stringify({ error: 'Request not found' }), {
                status: 404,
                headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
            });
        }

        const request = result[0];

        if (request.status === 'DELIVERED') {
            return new Response(JSON.stringify({ error: 'Already delivered' }), {
                status: 409,
                headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
            });
        }

        // Compare OTP (string comparison)
        if (String(request.otp) !== String(otp)) {
            return new Response(JSON.stringify({ success: false, error: 'Invalid OTP' }), {
                status: 403,
                headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
            });
        }

        // OTP matches — mark as delivered
        await sql`
            UPDATE requests
            SET status = 'DELIVERED', updated_at = NOW()
            WHERE id = ${id}
        `;

        return new Response(JSON.stringify({ success: true, message: 'OTP verified! Delivery complete.' }), {
            headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
        });
    } catch (error) {
        console.error('Verify OTP error:', error);
        return new Response(JSON.stringify({ error: 'Failed to verify OTP' }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' }
        });
    }
};

export const config = {
    path: '/api/verify-otp'
};
