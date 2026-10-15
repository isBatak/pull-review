import type { SelectOption } from '../components/ui/select'
import { CHAT_EFFORTS, CHAT_MODELS } from '../../shared/chat'

export const MODEL_OPTIONS: SelectOption[] = CHAT_MODELS.map(option => ({ value: option.id, label: option.label }))
export const EFFORT_OPTIONS: SelectOption[] = CHAT_EFFORTS.map(option => ({ value: option.id, label: option.label }))
