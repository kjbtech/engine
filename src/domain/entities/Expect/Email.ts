import { BaseWithMailer, type BaseParams } from './base'
import { TestError } from '@domain/entities/Error/Test'
import type { Filter } from '@domain/entities/Filter'
import type { Mailer } from '@domain/services/Mailer'

interface Params extends BaseParams {
  mailbox: string
  find: Filter[]
}

export class Email extends BaseWithMailer {
  private _log: (message: string) => void

  constructor(private _params: Params) {
    super(_params.mailbox)
    const { logger } = _params
    this._log = logger.init('expect:email')
  }

  executeWithMailer = async (mailer: Mailer) => {
    const { mailbox, find } = this._params
    this._log(`checking if mailbox "${mailbox}" has an email matching "${JSON.stringify(find)}"`)
    const email = await mailer.find(mailbox, find)
    if (!email) {
      const expect = find.reduce((acc, filter) => ({ ...acc, [filter.field]: filter.value }), {})
      throw new TestError({
        code: 'EMAIL_NOT_FOUND',
        expected: JSON.stringify(expect),
        received: undefined,
      })
    }
  }
}
