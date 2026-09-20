import { getVercelRuntime, safeHealthPayload } from '../cognitive-os/src/vercel-runtime.js';

export default async function handler(request, response) {
  if (request.method !== 'GET') {
    response.setHeader('Allow', 'GET');
    return response.status(405).json({ error: 'method_not_allowed' });
  }

  try {
    const { runtime } = await getVercelRuntime();
    return response.status(200).json(safeHealthPayload(runtime));
  } catch {
    return response.status(503).json({
      ok: false,
      service: 'mira-cognitive-os',
      error: 'runtime_unavailable',
    });
  }
}
