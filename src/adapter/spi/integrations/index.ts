import type { NotionConfig } from '@domain/integrations/Notion'
import type { PappersConfig } from '@domain/integrations/Pappers'
import type { QontoConfig } from '@domain/integrations/Qonto'
import type { NgrokConfig } from '@domain/integrations/Ngrok'
import type { AirtableConfig } from '@domain/integrations/Airtable'

import type { IPappersIntegration } from './PappersSpi'
import type { INotionIntegration } from './NotionSpi'
import type { IQontoIntegration } from './QontoSpi'
import type { INgrokIntegration } from './NgrokSpi'
import type { IAirtableIntegration } from './AirtableSpi'

export interface Integrations {
  airtable: (config?: AirtableConfig) => IAirtableIntegration
  notion: (config?: NotionConfig) => INotionIntegration
  pappers: (config?: PappersConfig) => IPappersIntegration
  qonto: (config?: QontoConfig) => IQontoIntegration
  ngrok: (config?: NgrokConfig) => INgrokIntegration
}
