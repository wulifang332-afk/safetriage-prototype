import { TriageError, type Generator } from './engine.ts';
export type ServerConfig = {
  DEEPSEEK_API_KEY?: string; LLM_MODEL?: string; ACCESS_CODE?: string;
  ALLOWED_ORIGIN?: string; ALLOW_LOCAL_DEV?: string;
};
export function deepseek(config: ServerConfig, fetcher: typeof fetch = fetch): Generator {
  return async (system, user) => {
    if (!config.DEEPSEEK_API_KEY) throw new TriageError('SERVICE_NOT_CONFIGURED', 'The server needs a DeepSeek API key.', 503);
    let response: Response;
    try {
      response = await fetcher('https://api.deepseek.com/chat/completions', {
        method: 'POST', signal: AbortSignal.timeout(45000),
        headers: { Authorization: `Bearer ${config.DEEPSEEK_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: config.LLM_MODEL || 'deepseek-flash', max_tokens: 1400,
          temperature: 0.1, thinking: { type: 'disabled' }, response_format: { type: 'json_object' },
          messages: [{ role: 'system', content: system }, { role: 'user', content: user }], stream: false }),
      });
    } catch {
      throw new TriageError('MODEL_UNAVAILABLE', 'DeepSeek could not be reached within 45 seconds. Retry or route this case to staff.', 504);
    }
    if (!response.ok) {
      const [code, message] = response.status === 402 ? ['MODEL_BALANCE_EMPTY', 'DeepSeek has no available credit. The project owner must top up the API balance.']
        : response.status === 401 ? ['MODEL_AUTH_FAILED', 'DeepSeek rejected the server API key. The project owner must update its Secret.']
        : response.status === 429 ? ['MODEL_RATE_LIMITED', 'DeepSeek is rate limiting requests. Please try again later.']
        : ['MODEL_UNAVAILABLE', 'DeepSeek could not complete this request. No draft was accepted.'];
      throw new TriageError(code, message, response.status === 429 ? 429 : 502);
    }
    const value = await response.json() as { model?: string; choices?: { finish_reason?: string; message?: { content?: string } }[]; usage?: { prompt_tokens?: number; completion_tokens?: number } };
    const choice = value.choices?.[0];
    if (choice?.finish_reason !== 'stop' || !choice.message?.content) throw new TriageError('INCOMPLETE_MODEL_OUTPUT', 'The model response was incomplete or refused. No draft was accepted.', 502);
    return { text: choice.message.content, model: value.model || config.LLM_MODEL || 'deepseek-flash', inputTokens: value.usage?.prompt_tokens, outputTokens: value.usage?.completion_tokens };
  };
}
