import type { DatabaseDriver } from '@adapter/spi/DatabaseSPI'
import SQLite from 'better-sqlite3'
import { Kysely, SqliteDialect } from 'kysely'
import { KyselyDatabaseTable, type Database } from './KyselyDatabaseTableDriver'

export class KyselyDatabaseDriver implements DatabaseDriver {
  private db: Kysely<Database>

  constructor() {
    const dialect = new SqliteDialect({
      database: new SQLite(':memory:', { fileMustExist: true }),
    })
    this.db = new Kysely<Database>({ dialect })
  }

  async disconnect(): Promise<void> {
    await this.db.destroy()
  }

  table(name: string) {
    return new KyselyDatabaseTable(name, this.db)
  }
}
