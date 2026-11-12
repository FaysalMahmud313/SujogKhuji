import { handleAuthEmail } from '../../server/auth-email.js';

export default async (request) => {
  let body = '';
  try { body = request.method === 'POST' ? await request.text() : ''; } catch { body = ''; }
  const result = await handleAuthEmail({
    method: request.method,
    headers: Object.fromEntries(request.headers),
    body,
    env: process.env,
  });
  return new Response(JSON.stringify(result.body), {
    status: result.status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
};

export const config = { path: '/api/auth-email' };
