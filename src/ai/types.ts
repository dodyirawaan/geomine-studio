export type ProviderId = 'anthropic' | 'openai' | 'gemini' | 'openrouter'

export type Effort = 'low' | 'medium' | 'high' | 'xhigh' | 'max'

export interface ModelInfo {
  id: string
  name?: string
  contextLength?: number
}

export interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

export interface Usage {
  inputTokens?: number
  outputTokens?: number
}

export interface ChatRequest {
  model: string
  system: string
  messages: ChatMessage[]
  maxTokens: number
  effort?: Effort
  signal?: AbortSignal
  /** Which part of the app made the request, for the usage log. */
  feature?: string
  /** Short classification-style task (e.g. screening): ask the model to think briefly to save tokens and quota. */
  light?: boolean
  /** A conversation that will continue: cache the whole prompt so the next turn re-reads it cheaply (Anthropic). */
  conversation?: boolean
}

export interface ChatResult {
  usage?: Usage
  /** Set when the provider stopped for a reason the user should know about (refusal, length limit). */
  notice?: string
  /** Model that actually served the request, when it differs from the requested one. */
  servedBy?: string
}

export interface Provider {
  id: ProviderId
  label: string
  keyHint: string
  keyUrl: string
  listModels: (apiKey: string) => Promise<ModelInfo[]>
  streamChat: (apiKey: string, req: ChatRequest, onText: (delta: string) => void) => Promise<ChatResult>
}
