import { NotionIntegration } from './NotionIntegration.mock'
import { notionTableSample2, notionTableSample1, notionUserSample } from './NotionSamples'

export const integration = new NotionIntegration({
  token: ':memory:',
})

await integration.addTable(notionTableSample2.name, notionTableSample2.fields)
await integration.addTable(notionTableSample1.name, notionTableSample1.fields)
await integration.addUser(notionUserSample)
