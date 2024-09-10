import type { PersistedRecord } from '@domain/entities/Record/Persisted'
import type { Logger } from './Logger'
import type { Table } from '@domain/entities/Table'
import type { IdGenerator } from './IdGenerator'
import type { Database } from './Database'

export interface Config {
  type: string
  url: string
}

export interface Services {
  logger: Logger
  idGenerator: IdGenerator
  database: Database
}

export interface Entities {
  tables: Table[]
}

export type Action = 'INSERT' | 'UPDATE' | 'DELETE'

export interface RealtimeEvent {
  action: Action
  table: string
  recordId: string
}

interface Listener {
  id: string
  action: Action
  table: string
  callback: (record: PersistedRecord) => Promise<void>
}

export class Realtime {
  private _db: Database
  private _tables: Table[]
  private _log: (message: string) => void
  private _listeners: Listener[]

  constructor(
    private _services: Services,
    private _entities: Entities
  ) {
    const { logger, database } = _services
    const { tables } = _entities
    this._db = database
    this._log = logger.init('realtime')
    this._listeners = []
    this._tables = tables
  }

  setup = async () => {
    this._log('setup realtime...')
    this._db.onNotification(this._onEvent)
    await this._db.setupTriggers(this._tables.map((t) => t.name))
    if (this._db.type === 'postgres') {
      await this._db.exec(`LISTEN realtime`)
    }
  }

  onInsert = (table: string, callback: (record: PersistedRecord) => Promise<void>) => {
    const { idGenerator } = this._services
    const id = idGenerator.forListener()
    this._listeners.push({
      action: 'INSERT',
      table,
      callback,
      id,
    })
    this._log(`subscribed to insert events with id "${id}" on table "${table}"`)
    return id
  }

  removeListener = (id: string) => {
    this._listeners = this._listeners.filter((l) => l.id !== id)
    this._log(`unsubscribing from insert events with id "${id}"`)
  }

  private _onEvent = async (event: RealtimeEvent) => {
    const { action, table: tableName, recordId } = event
    this._log(
      `received event on table "${tableName}" with action "${action}" for record "${recordId}"`
    )
    const table = this._tables.find((t) => t.name === tableName)
    if (!table) throw new Error(`Table ${table} not found`)
    const record = await table.db.readById(recordId)
    if (!record) return
    const listeners = this._listeners.filter((l) => l.table === table.name && l.action === action)
    const promises = []
    for (const listener of listeners) {
      promises.push(listener.callback(record))
    }
    await Promise.all(promises)
  }
}
