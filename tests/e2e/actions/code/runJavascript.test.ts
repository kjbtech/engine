import { test, expect } from '@tests/fixtures'
import App, { type Config } from '@latechforce/engine'

test.describe('Run JavaScript code action', () => {
  test('should run a JavaScript code', async ({ request }) => {
    // GIVEN
    const config: Config = {
      name: 'App',
      automations: [
        {
          name: 'addNumbers',
          trigger: {
            service: 'Http',
            event: 'ApiCalled',
            path: 'add-numbers',
            input: {
              type: 'object',
              properties: {
                numberOne: { type: 'number' },
                numberTwo: { type: 'number' },
              },
            },
            output: {
              sum: {
                value: '{{runJavascriptCode.result}}',
                type: 'number',
              },
            },
          },
          actions: [
            {
              service: 'Code',
              action: 'RunJavascript',
              name: 'runJavascriptCode',
              input: {
                numberOne: {
                  value: '{{trigger.body.numberOne}}',
                  type: 'number',
                },
                numberTwo: {
                  value: '{{trigger.body.numberTwo}}',
                  type: 'number',
                },
              },
              // eslint-disable-next-line
              // @ts-ignore
              code: String(async function (context) {
                const { inputData } = context
                const { numberOne, numberTwo } = inputData
                return { result: numberOne + numberTwo }
              }),
            },
          ],
        },
      ],
    }
    const app = new App()
    const url = await app.start(config)

    // WHEN
    const response = await request
      .post(`${url}/api/automation/add-numbers`, {
        data: {
          numberOne: 1,
          numberTwo: 2,
        },
      })
      .then((res) => res.json())

    // THEN
    expect(response.sum).toBe(3)
  })
})
