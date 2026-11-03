import { GoogleGenAI } from '@google/genai';
import { env } from '../config/env.js';
import { AppError, aiUnavailable } from '../utils/errors.js';
import { logger } from '../utils/logger.js';

/**
 * AI provider abstraction over the official Google Gen AI SDK (Gemini).
 *
 * Interface (provider-neutral, so callers never touch SDK shapes):
 *   model: string
 *   respond({ instructions, input, tools, maxOutputTokens }) ->
 *     { text, toolCalls: [{ callId, name, arguments(JSON string) }], rawContent }
 *   structured({ instructions, input, name, schema, maxOutputTokens }) -> object
 *
 * `input` items:
 *   { role: 'user' | 'assistant', content: string }
 *   { type: 'model_content', content }                       (rawContent from a previous respond())
 *   { type: 'tool_result', callId, name, output: string }    (JSON string)
 * `tools`: [{ name, description, parameters (JSON schema) }]
 *
 * Tests inject a fake with setAIProvider(); `null` simulates "no key".
 */

let override;
let cached;

export function setAIProvider(provider) {
  override = provider;
}

export function getAIProvider() {
  if (override !== undefined) return override;
  if (!env.GEMINI_API_KEY) return null;
  cached ??= createGeminiProvider({ apiKey: env.GEMINI_API_KEY, model: env.GEMINI_MODEL, fallbackModel: env.GEMINI_FALLBACK_MODEL, timeoutMs: env.AI_TIMEOUT_MS });
  return cached;
}

export function requireAI() {
  const provider = getAIProvider();
  if (!provider) {
    throw aiUnavailable('Sarthi AI is not configured on this server (no AI API key). Discovery, eligibility checks, saving, and tracking still work.');
  }
  return provider;
}

function mapError(err) {
  if (err instanceof AppError) return err;
  const status = err?.status ?? err?.code;
  logger.warn('AI provider error', { status, name: err?.name, message: err?.message });
  if (err?.name === 'AbortError' || /timed? ?out|deadline/i.test(err?.message ?? '')) {
    return new AppError(504, 'AI_TIMEOUT', 'Sarthi took too long to respond. Please try again.');
  }
  if (status === 401 || status === 403 || /API key/i.test(err?.message ?? '')) {
    return aiUnavailable('Sarthi AI is misconfigured on the server (API key rejected).');
  }
  if (status === 429) return new AppError(503, 'AI_BUSY', 'Sarthi is busy right now. Please try again in a minute.');
  return aiUnavailable('Sarthi could not complete this request. Please try again.');
}

/** Converts neutral input items into Gemini `contents`. */
export function toGeminiContents(input) {
  const contents = [];
  for (const item of input) {
    if (item.type === 'model_content') {
      contents.push(item.content);
    } else if (item.type === 'tool_result') {
      let response;
      try { response = { output: JSON.parse(item.output) }; } catch { response = { output: item.output }; }
      const part = { functionResponse: { name: item.name, response, ...(item.callId ? { id: item.callId } : {}) } };
      const last = contents.at(-1);
      // Consecutive results are sent together in one user turn.
      if (last?.role === 'user' && last.parts.every((p) => p.functionResponse)) last.parts.push(part);
      else contents.push({ role: 'user', parts: [part] });
    } else {
      contents.push({ role: item.role === 'assistant' ? 'model' : 'user', parts: [{ text: item.content }] });
    }
  }
  return contents;
}

const isModelNotFound = (err) => (err?.status ?? err?.code) === 404 || /not found|is not supported|unknown model/i.test(err?.message ?? '');

export function createGeminiProvider({ apiKey, model, fallbackModel, timeoutMs }) {
  const client = new GoogleGenAI({ apiKey });
  const httpOptions = { timeout: timeoutMs };
  // If the configured model id is rejected (renamed/retired), switch once to the fallback and keep using it.
  let activeModel = model;

  async function generate(request) {
    try {
      return await client.models.generateContent({ ...request, model: activeModel });
    } catch (err) {
      if (fallbackModel && activeModel !== fallbackModel && isModelNotFound(err)) {
        logger.warn('AI model not found, switching to fallback', { model: activeModel, fallbackModel });
        activeModel = fallbackModel;
        provider.model = fallbackModel;
        return client.models.generateContent({ ...request, model: activeModel });
      }
      throw err;
    }
  }

  const provider = {
    model,
    async respond({ instructions, input, tools, maxOutputTokens = 1500, temperature = 0.3 }) {
      try {
        const response = await generate({
          contents: toGeminiContents(input),
          config: {
            systemInstruction: instructions,
            maxOutputTokens,
            temperature,
            httpOptions,
            ...(tools?.length
              ? { tools: [{ functionDeclarations: tools.map((t) => ({ name: t.name, description: t.description, parametersJsonSchema: t.parameters })) }] }
              : {}),
          },
        });
        const toolCalls = (response.functionCalls ?? []).map((c) => ({
          callId: c.id ?? c.name,
          name: c.name,
          arguments: JSON.stringify(c.args ?? {}),
        }));
        return { text: toolCalls.length ? '' : (response.text ?? ''), toolCalls, rawContent: response.candidates?.[0]?.content };
      } catch (err) {
        throw mapError(err);
      }
    },
    async structured({ instructions, input, name, schema, maxOutputTokens = 2500, temperature = 0.2 }) {
      let response;
      try {
        response = await generate({
          contents: typeof input === 'string' ? input : toGeminiContents(input),
          config: {
            systemInstruction: instructions,
            maxOutputTokens,
            temperature,
            httpOptions,
            responseMimeType: 'application/json',
            responseJsonSchema: schema,
          },
        });
      } catch (err) {
        throw mapError(err);
      }
      try {
        return JSON.parse(response.text);
      } catch {
        logger.warn('AI returned non-JSON structured output', { name });
        throw new AppError(502, 'AI_INVALID_OUTPUT', 'Sarthi returned an incomplete answer. Please try again.');
      }
    },
  };
  return provider;
}

/**
 * Structured generation with one self-repair attempt: if the output is not
 * valid JSON or fails the Zod schema, the model is told exactly what was wrong
 * and asked again. Still-invalid output is rejected (never persisted).
 */
export async function structuredWithRepair(ai, args, zodSchema) {
  let first;
  let problem;
  try {
    first = await ai.structured(args);
    const parsed = zodSchema.safeParse(first);
    if (parsed.success) return parsed.data;
    problem = parsed.error.issues.slice(0, 5).map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`).join('; ');
  } catch (err) {
    if (err?.code !== 'AI_INVALID_OUTPUT') throw err;
    problem = 'the response was not valid JSON';
  }
  logger.info('Retrying structured AI output after validation failure', { name: args.name });
  const repairInput = `${typeof args.input === 'string' ? args.input : JSON.stringify(args.input)}\n\nYour previous answer was rejected because ${problem}. Return a corrected answer that satisfies the JSON schema exactly.`;
  const second = await ai.structured({ ...args, input: repairInput });
  const parsed = zodSchema.safeParse(second);
  if (parsed.success) return parsed.data;
  throw new AppError(502, 'AI_INVALID_OUTPUT', 'Sarthi returned an answer in an unexpected format. Please try again.');
}
