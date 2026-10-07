function clone(value) {
  return structuredClone(value);
}

function extractOutputText(response) {
  if (typeof response?.output_text === 'string' && response.output_text) return response.output_text;
  for (const item of response?.output || []) {
    if (item?.type !== 'message') continue;
    for (const content of item.content || []) {
      if (content?.type === 'output_text' && typeof content.text === 'string') return content.text;
      if (typeof content?.text === 'string') return content.text;
    }
  }
  throw new Error('OpenAI response contained no output text');
}

function buildFormat(request) {
  if (request.jsonSchema) {
    return {
      type: 'json_schema',
      name: request.schemaName || 'mira_result',
      strict: request.strictSchema !== false,
      schema: clone(request.jsonSchema),
    };
  }
  return { type: 'json_object' };
}

export class OpenAIResponsesAdapter {
  constructor({
    apiKey,
    model,
    fetchImpl = globalThis.fetch,
    baseUrl = 'https://api.openai.com/v1',
    timeoutMs = 60_000,
    maxOutputTokens = null,
  } = {}) {
    if (!apiKey) throw new Error('apiKey is required');
    if (!model) throw new Error('model is required');
    if (typeof fetchImpl !== 'function') throw new Error('fetch implementation is required');
    this.apiKey = apiKey;
    this.model = model;
    this.fetchImpl = fetchImpl;
    this.baseUrl = String(baseUrl).replace(/\/$/, '');
    this.timeoutMs = Math.max(1000, Number(timeoutMs));
    this.maxOutputTokens = maxOutputTokens == null ? null : Math.max(1, Number(maxOutputTokens));
  }

  async generate(request = {}) {
    const controller = new AbortController();
    const parentSignal = request.signal || null;
    const parentAbort = parentSignal ? () => controller.abort() : null;
    if (parentAbort) parentSignal.addEventListener('abort', parentAbort, { once: true });
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    const instructions = [
      request.instructions || '',
      'Return a JSON object only. Preserve the requested contract and do not silently omit constraints.',
    ].filter(Boolean).join('\n\n');

    const body = {
      model: request.model || this.model,
      instructions,
      input: JSON.stringify({
        kind: request.kind || 'completion',
        role: request.role || null,
        attempt: request.attempt || 1,
        repair: request.repair || null,
        input: request.input ?? null,
      }),
      text: { format: buildFormat(request) },
      ...(this.maxOutputTokens ? { max_output_tokens: this.maxOutputTokens } : {}),
    };

    try {
      const response = await this.fetchImpl(`${this.baseUrl}/responses`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      if (!response?.ok) {
        let code = response?.status || 0;
        let requestId = response?.headers?.get?.('x-request-id') || null;
        let detail = '';
        try {
          const errorBody = await response.json();
          detail = String(errorBody?.error?.message || errorBody?.message || '').slice(0, 500);
        } catch {}
        throw new Error(
          `OpenAI Responses API error ${code}${requestId ? ` request_id=${requestId}` : ''}${detail ? `: ${detail}` : ''}`,
        );
      }

      const data = await response.json();
      if (data?.status === 'incomplete') {
        const reason = data?.incomplete_details?.reason || 'unknown';
        throw new Error(`OpenAI response incomplete: ${reason}`);
      }
      return extractOutputText(data);
    } catch (error) {
      if (controller.signal.aborted) throw new Error('OpenAI request aborted or timed out');
      throw error;
    } finally {
      clearTimeout(timer);
      if (parentAbort) parentSignal.removeEventListener('abort', parentAbort);
    }
  }
}

export function createOpenAIResponsesGenerate(options) {
  const adapter = new OpenAIResponsesAdapter(options);
  return (request) => adapter.generate(request);
}
