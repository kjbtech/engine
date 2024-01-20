export type AppErrorCode =
  | 'NAME_REQUIRED'
  | 'FEATURES_REQUIRED'
  | 'ROLES_REQUIRED'
  | 'UNKNOWN_PROPERTY'
  | 'COMPONENTS_REQUIRED'
  | 'TRANSLATIONS_REQUIRED'
  | 'NAME_STRING_TYPE_REQUIRED'
  | 'ROLES_ARRAY_TYPE_REQUIRED'
  | 'FEATURES_ARRAY_TYPE_REQUIRED'
  | 'COMPONENTS_ARRAY_TYPE_REQUIRED'
  | 'TRANSLATIONS_ARRAY_TYPE_REQUIRED'

export interface AppErrorData {
  property: string
}

export class AppError extends Error {
  public code: string

  constructor(
    public message: AppErrorCode,
    public data?: AppErrorData
  ) {
    super(message)
    this.name = 'APP_ERROR'
    this.code = this.name + '_' + message
  }
}
