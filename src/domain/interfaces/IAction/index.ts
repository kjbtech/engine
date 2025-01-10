import type { ICreateRecordDatabaseAction } from './database/ICreateRecord'
import type { IRunJavascriptCodeAction } from './code/IRunJavascript'
import type { IRunTypescriptCodeAction } from './code/IRunTypescript'
import type { IReadRecordDatabaseAction } from './database/IReadRecord'
import type { IGetCompanyPappersAction } from './pappers/IGetCompany'
import type { ICreateClientQontoAction } from './qonto/ICreateClient'
import type { IUpdatePageNotionAction } from './notion/IUpdatePage'

export type IAction =
  | IRunJavascriptCodeAction
  | IRunTypescriptCodeAction
  | ICreateRecordDatabaseAction
  | IReadRecordDatabaseAction
  | IGetCompanyPappersAction
  | ICreateClientQontoAction
  | IUpdatePageNotionAction
