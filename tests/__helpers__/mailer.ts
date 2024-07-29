import Logger from './logger'
import { MailerDriver } from '@infrastructure/drivers/MailerDriver'
import type { Config } from '@domain/services/Mailer'
import { join } from 'path'
import { nanoid } from 'nanoid'
import fs from 'fs-extra'
import { DatabaseDriver } from '@infrastructure/drivers/DatabaseDriver'
import type { FilterDto } from '@adapter/spi/dtos/FilterDto'
import type { SentDto } from '@adapter/spi/dtos/EmailDto'

export default class extends MailerDriver {
  public config: Config
  private _database: DatabaseDriver

  constructor() {
    const logger = new Logger()
    const log = logger.init('[test]:mailer')
    log(`creating mailbox...`)
    const host = join(process.cwd(), 'tmp', `mailbox-${nanoid()}.db`)
    fs.ensureFileSync(host)
    const config = {
      host,
      port: '0',
      user: '_sqlite',
      pass: '_sqlite',
      from: 'noreply@localhost',
    }
    super(config)
    this.config = config
    this._database = new DatabaseDriver({ url: host, type: 'sqlite' })
    log(`mailbox created`)
  }

  get emails() {
    return this._database.table('emails')
  }

  waitForEmail = async (filters: FilterDto[]): Promise<SentDto> => {
    let email: SentDto | undefined
    while (!email) {
      email = await this.find(filters)
      await new Promise((resolve) => setTimeout(resolve, 500))
    }
    return email
  }
}
