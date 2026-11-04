import type { Env, Hono } from 'hono'
import type { FeedbackContext } from '../../shared/self-improve'
import type { SelfImproveService } from './service'
import { SelfImproveError } from './service'

export function registerSelfImproveRoutes<E extends Env>(api: Hono<E>, service: SelfImproveService | undefined) {
  function selfImprove() {
    if (!service)
      throw new SelfImproveError('Local changes are not available here.', 404)
    return service
  }

  api.get('/self-improve/state', async c => c.json(await selfImprove().state()))

  api.post('/self-improve/changes', async (c) => {
    const { request, context } = await c.req.json<{ request: unknown, context: unknown }>()
    if (typeof request !== 'string' || !context || typeof context !== 'object')
      return c.json({ error: 'Expected request and context' }, 400)
    return c.json(await selfImprove().create({ request, context: context as FeedbackContext }))
  })

  api.post('/self-improve/changes/:id/dismiss', async c => c.json(await selfImprove().dismiss(c.req.param('id'))))

  api.post('/self-improve/active', async (c) => {
    const { on } = await c.req.json<{ on: unknown }>()
    if (typeof on !== 'boolean')
      return c.json({ error: 'Expected on' }, 400)
    await selfImprove().setActive(on)
    return c.json({ ok: true })
  })

  api.post('/self-improve/boot-failure/dismiss', async (c) => {
    await selfImprove().clearBootFailure()
    return c.json({ ok: true })
  })

  api.post('/self-improve/open-folder', async (c) => {
    selfImprove().openFolder()
    return c.json({ ok: true })
  })
}
