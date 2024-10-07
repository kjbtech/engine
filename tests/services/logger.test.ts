import { test, expect } from '@tests/fixtures'
import App, { type App as Config } from '@safidea/engine'
import { nanoid } from 'nanoid'
import fs from 'fs-extra'
import { join } from 'path'
import {
  getElasticSearchHit,
  esUrl,
  esUsername,
  esIndex,
  esPassword,
  type Hit,
  checkElasticSearchIndex,
  deleteElasticSearchIndex,
} from '@tests/logger'

test.describe('Logger', () => {
  test.describe('File driver', () => {
    test('should log "app started"', async () => {
      // GIVEN
      const filename = join(process.cwd(), 'tmp', `app-${nanoid()}.log`)
      fs.ensureFileSync(filename)
      const config: Config = {
        name: 'app',
        logger: {
          driver: 'File',
          level: 'debug',
          filename,
        },
      }
      const app = new App()

      // WHEN
      await app.start(config)

      // THEN
      let content = ''
      let i = 0
      do {
        if (i++ > 0) await new Promise((resolve) => setTimeout(resolve, 1000))
        content = await fs.readFile(filename, 'utf8')
      } while (!content.includes('app started') && i < 10)
      expect(content).toContain('app started')
    })
  })

  test.describe('ElasticSearch driver', () => {
    test('should start an app with ES config', async ({ request }) => {
      // GIVEN
      const id = nanoid()
      const message = `Test error ${id} for ElasticSearch`
      const config: Config = {
        name: 'app',
        automations: [
          {
            name: 'throwError',
            trigger: {
              event: 'ApiCalled',
              path: 'error',
            },
            actions: [
              {
                name: 'throwError',
                service: 'Code',
                action: 'RunJavascript',
                code: `throw new Error("${message}")`,
              },
            ],
          },
        ],
        logger: {
          driver: 'ElasticSearch',
          url: esUrl!,
          username: esUsername!,
          password: esPassword!,
          index: esIndex!,
        },
      }
      const app = new App()
      const url = await app.start(config)

      // WHEN
      await request.post(`${url}/api/automation/error`)

      // THEN
      let hit: Hit | undefined
      do {
        const hits = await getElasticSearchHit(message)
        hit = hits.find((hit) => hit._source.message.includes(message))
        if (!hit) await new Promise((resolve) => setTimeout(resolve, 1000))
      } while (!hit)
      expect(hit).toBeDefined()
      expect(hit._source.message).toContain(message)
    })

    test("should create an ES index if it doesn't exit at start", async () => {
      // GIVEN
      const id = nanoid()
      const index = `test_index_${id}`.toLowerCase()
      const config: Config = {
        name: 'app',
        logger: {
          driver: 'ElasticSearch',
          url: esUrl!,
          username: esUsername!,
          password: esPassword!,
          index: index!,
        },
      }
      const app = new App()

      // WHEN
      await app.start(config)

      // THEN
      const exists = await checkElasticSearchIndex(index)
      await deleteElasticSearchIndex(index)
      expect(exists).toBe(true)
    })
  })
})
