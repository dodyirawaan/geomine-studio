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
