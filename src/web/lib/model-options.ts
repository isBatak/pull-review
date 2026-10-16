import type { SelectOption } from '../components/ui/select'
import { CHAT_MODELS } from '../../shared/chat'

export const MODEL_OPTIONS: SelectOption[] = CHAT_MODELS.map(option => ({ value: option.id, label: option.label }))
