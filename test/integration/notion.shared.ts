import { env } from '@test/fixtures'
import type { INotionIntegration } from '@adapter/spi/integrations/NotionSpi'
import type { TestRunner } from '@test/integrations'

const { TEST_NOTION_TABLE_1_ID } = env

export function testNotionIntegration(
  { describe, it, expect }: TestRunner,
  integration: INotionIntegration
) {
  describe('getTable', () => {
    it('should get a table id without -', async () => {
      // GIVEN
      const table = await integration.getTable(TEST_NOTION_TABLE_1_ID)

      // THEN
      expect(table.id).not.toContain('-')
    })
  })

  describe('listAllUsers', () => {
    it('should retrieve all the users of a workspace', async () => {
      // WHEN
      const users = await integration.listAllUsers()

      // THEN
      expect(users.length > 0).toBeTruthy()
    })
  })
}
