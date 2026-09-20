import { getVercelRuntime, safeReadinessPayload } from '../cognitive-os/src/vercel-runtime.js';

export default async function handler(request, response) {
  if (request.method !== 'GET') {
    response.setHeader('Allow', 'GET');
    return response.status(405).json({ error: 'method_not_allowed' });
  }

  try {
    const { runtime, query } = await getVercelRuntime();
    const payload = await safeReadinessPayload({ runtime, query });
    return response.status(payload.ready ? 200 : 503).json(payload);
  } catch {
    return response.status(503).json({
      ready: false,
      checks: {
        configuration: false,
        modelConfigured: false,
        database: false,
      },
    });
  }
}
