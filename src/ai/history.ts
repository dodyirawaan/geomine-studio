import type { ChatMessage } from './types'

/** About 15,000 tokens of earlier conversation; older turns are dropped so long chats do not resend everything. */
const HISTORY_CHARS = 60000

/** The most recent turns that fit the budget, always starting with a user message (and always keeping the last one). */
export function recentHistory(messages: ChatMessage[], budget = HISTORY_CHARS): ChatMessage[] {
  let used = 0
  let start = messages.length - 1
  while (start > 0 && used + messages[start - 1].content.length + messages[start].content.length <= budget) {
    used += messages[start].content.length
    start--
  }
  while (start < messages.length - 1 && messages[start].role !== 'user') start++
  return messages.slice(start)
}
