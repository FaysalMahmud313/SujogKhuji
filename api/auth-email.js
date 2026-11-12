import { handleAuthEmail } from '../server/auth-email.js';

async function run(request) {
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
}

export const POST = run;
export const GET = run;
export const PUT = run;
export const PATCH = run;
export const DELETE = run;
export const HEAD = run;
export const OPTIONS = run;
