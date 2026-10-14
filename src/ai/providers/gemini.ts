import { httpError, sseData } from '../sse'
import type { ChatResult, Provider } from '../types'

const BASE = 'https://generativelanguage.googleapis.com/v1beta'

interface RawGeminiModel {
  name: string
  displayName?: string
  inputTokenLimit?: number
  supportedGenerationMethods?: string[]
}

export const gemini: Provider = {
  id: 'gemini',
  label: 'Google Gemini',
  keyHint: 'AIza...',
  keyUrl: 'https://aistudio.google.com/apikey',

  async listModels(apiKey) {
    const res = await fetch(`${BASE}/models?pageSize=1000`, { headers: { 'x-goog-api-key': apiKey } })
    if (!res.ok) throw await httpError(res, 'Gemini')
    const body = (await res.json()) as { models: RawGeminiModel[] }
    return body.models
      .filter((m) => m.supportedGenerationMethods?.includes('generateContent') && /gemini/i.test(m.name))
      .map((m) => ({ id: m.name.replace(/^models\//, ''), name: m.displayName, contextLength: m.inputTokenLimit }))
      .sort((a, b) => b.id.localeCompare(a.id))
  },

  async streamChat(apiKey, req, onText): Promise<ChatResult> {
    const res = await fetch(`${BASE}/models/${encodeURIComponent(req.model)}:streamGenerateContent?alt=sse`, {
      method: 'POST',
      signal: req.signal,
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: req.system }] },
        contents: req.messages.map((m) => ({
          role: m.role === 'assistant' ? 'model' : 'user',
          parts: [{ text: m.content }],
        })),
        generationConfig: { maxOutputTokens: req.maxTokens },
      }),
    })
    if (!res.ok) throw await httpError(res, 'Gemini')

    const result: ChatResult = {}
    for await (const data of sseData(res)) {
      const chunk = JSON.parse(data)
      if (chunk.error) throw new Error(`Gemini: ${chunk.error.message}`)
      const cand = chunk.candidates?.[0]
      for (const part of cand?.content?.parts ?? []) {
        if (part.text && !part.thought) onText(part.text)
      }
      if (cand?.finishReason === 'MAX_TOKENS') result.notice = 'Output stopped at the max token limit.'
      if (cand?.finishReason === 'SAFETY' || cand?.finishReason === 'RECITATION') {
        result.notice = `Gemini stopped the response (${cand.finishReason}).`
      }
      if (chunk.promptFeedback?.blockReason) result.notice = `Prompt blocked by Gemini (${chunk.promptFeedback.blockReason}).`
      if (chunk.usageMetadata) {
        result.usage = {
          inputTokens: chunk.usageMetadata.promptTokenCount,
          outputTokens: chunk.usageMetadata.candidatesTokenCount,
        }
      }
    }
    return result
  },
}
