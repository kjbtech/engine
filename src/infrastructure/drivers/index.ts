import { PuppeteerBrowserDriver } from './PuppeteerBrowserDriver'
import { AJVSchemaValidatorDriver } from './AJVSchemaValidatorDriver'
import { ExpressServerDriver } from './ExpressServerDriver'
import { DebugLoggerDriver } from './DebugLoggerDriver'
import { ReactUiDriver } from './ReactUiDriver'
import { KyselyDatabaseDriver } from './KyselyDatabaseDriver'
import { NanoidIdGeneratorDriver } from './NanoidIdGeneratorDriver'
import type { Drivers } from '@adapter/spi'

export const drivers: Drivers = {
  schemaValidator: () => new AJVSchemaValidatorDriver(),
  browser: () => new PuppeteerBrowserDriver(),
  server: (port?: number) => new ExpressServerDriver(port),
  logger: (location: string) => new DebugLoggerDriver(location),
  ui: () => new ReactUiDriver(),
  database: (url?: string) => new KyselyDatabaseDriver(url),
  idGenerator: () => new NanoidIdGeneratorDriver(),
}
