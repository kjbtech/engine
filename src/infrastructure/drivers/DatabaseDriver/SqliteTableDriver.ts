import SQLite, { SqliteError } from 'better-sqlite3'
import type { Driver } from '@adapter/spi/DatabaseTableSpi'
import type { FilterDto } from '@adapter/spi/dtos/FilterDto'
import type { FieldDto } from '@adapter/spi/dtos/FieldDto'
import type { PersistedDto, ToCreateDto, ToUpdateDto } from '@adapter/spi/dtos/RecordDto'

interface ColumnInfo {
  name: string
  type: string
  notnull: number
}

export class SqliteTableDriver implements Driver {
  constructor(
    private _name: string,
    private _fields: FieldDto[],
    private _db: SQLite.Database
  ) {}

  exists = async () => {
    const result = this._db
      .prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name = ?`)
      .all(this._name)
    return result.length > 0
  }

  create = async () => {
    const tableColumns = this._buildColumnsQuery(this._fields)
    const tableQuery = `CREATE TABLE ${this._name} (${tableColumns})`
    this._db.exec(tableQuery)
    await this._createManyToManyTables()
    await this._createView()
  }

  migrate = async () => {
    const existingColumns = await this._getExistingColumns()
    const staticFields = this._fields.filter((field) => !field.formula)
    const fieldsToAdd = staticFields.filter((field) => !existingColumns.includes(field.name))
    const fieldsToAlter = staticFields.filter((field) => existingColumns.includes(field.name))
    const dropViewQuery = `DROP VIEW IF EXISTS ${this._name}_view`
    this._db.exec(dropViewQuery)
    for (const field of fieldsToAdd) {
      const [column, reference] = this._buildColumnsQuery([field]).split(',')
      const query = `ALTER TABLE ${this._name} ADD COLUMN ${column}`
      this._db.exec(query)
      if (reference) {
        this._db.exec(`ALTER TABLE ${this._name} ADD CONSTRAINT fk_${field.name} ${reference}`)
      }
    }
    if (fieldsToAlter.length > 0) {
      const tempTableName = `${this._name}_temp`
      const newSchema = this._buildColumnsQuery(staticFields)
      this._db.exec(`CREATE TABLE ${tempTableName} (${newSchema})`)
      const columnsToCopy = staticFields.map((field) => field.name).join(', ')
      this._db.exec(
        `INSERT INTO ${tempTableName} (${columnsToCopy}) SELECT ${columnsToCopy} FROM ${this._name}`
      )
      this._db.exec(`DROP TABLE ${this._name}`)
      this._db.exec(`ALTER TABLE ${tempTableName} RENAME TO ${this._name}`)
    }
    await this._createManyToManyTables()
    await this._createView()
  }

  insert = async (record: ToCreateDto) => {
    try {
      const keys = Object.keys(record)
      const values = this._preprocess(Object.values(record))
      const placeholders = keys.map(() => `?`).join(', ')
      const query = `INSERT INTO ${this._name} (${keys.join(', ')}) VALUES (${placeholders})`
      this._db.prepare(query).run(values)
    } catch (e) {
      this._throwError(e)
    }
  }

  insertMany = async (records: ToCreateDto[]) => {
    try {
      for (const record of records) await this.insert(record)
    } catch (e) {
      this._throwError(e)
    }
  }

  update = async (record: ToUpdateDto) => {
    try {
      const keys = Object.keys(record)
      const values = this._preprocess(Object.values(record))
      const setString = keys.map((key) => `${key} = ?`).join(', ')
      const query = `UPDATE ${this._name} SET ${setString} WHERE id = ${record.id}`
      this._db.prepare(query).run(values)
    } catch (e) {
      this._throwError(e)
    }
  }

  updateMany = async (records: ToUpdateDto[]) => {
    try {
      for (const record of records) await this.update(record)
    } catch (e) {
      this._throwError(e)
    }
  }

  delete = async (filters: FilterDto[]) => {
    try {
      const conditions = filters
        .map((filter) => `${filter.field} ${filter.operator} ?`)
        .join(' AND ')
      const values = filters.map((filter) => filter.value)
      const query = `DELETE FROM ${this._name} ${conditions.length > 0 ? `WHERE ${conditions}` : ''}`
      this._db.prepare(query).run(values)
    } catch (e) {
      this._throwError(e)
    }
  }

  read = async (filters: FilterDto[]) => {
    const conditions = filters.map((filter) => `${filter.field} ${filter.operator} ?`).join(' AND ')
    const values = filters.map((filter) => filter.value)
    const query = `SELECT * FROM ${this._name}_view ${conditions.length > 0 ? `WHERE ${conditions}` : ''} LIMIT 1`
    const record = this._db.prepare(query).get(values) as PersistedDto | undefined
    return record ? this._postprocess(record) : undefined
  }

  readById = async (id: string) => {
    const query = `SELECT * FROM ${this._name}_view WHERE id = ?`
    const record = this._db.prepare(query).get([id]) as PersistedDto | undefined
    return record ? this._postprocess(record) : undefined
  }

  list = async (filters: FilterDto[]) => {
    const conditions = filters.map((filter) => `${filter.field} ${filter.operator} ?`).join(' AND ')
    const values = filters.map((filter) => filter.value)
    const query = `SELECT * FROM ${this._name}_view ${conditions.length > 0 ? `WHERE ${conditions}` : ''}`
    const records = this._db.prepare(query).all(values) as PersistedDto[]
    return records.map(this._postprocess)
  }

  private _buildColumnsQuery = (fields: FieldDto[]) => {
    const columns = []
    const references = []
    for (const field of fields) {
      if (field.formula || (field.type === 'TEXT[]' && field.table)) continue
      let query = `"${field.name}" ${field.type}`
      if (field.name === 'id') {
        query += ' PRIMARY KEY'
      } else if (field.type === 'TEXT' && field.options) {
        query += ` CHECK ("${field.name}" IN ('${field.options.join("', '")}'))`
      } else if (field.type === 'TEXT' && field.table) {
        references.push(`FOREIGN KEY ("${field.name}") REFERENCES ${field.table}(id)`)
      }
      if (field.required) {
        query += ' NOT NULL'
      }
      columns.push(query)
    }
    columns.push(...references)
    return columns.join(', ')
  }

  private _getManyToManyTableName = (tableName: string) => {
    return [this._name, tableName].sort().join('_')
  }

  private _createManyToManyTables = async () => {
    for (const field of this._fields) {
      if (field.type === 'TEXT[]' && field.table) {
        // TODO: Add a check to see if the table exists
        const manyToManyTableName = this._getManyToManyTableName(field.table)
        const query = `
          CREATE TABLE IF NOT EXISTS ${manyToManyTableName} (
            "${this._name}_id" INTEGER NOT NULL,
            "${field.table}_id" INTEGER NOT NULL,
            FOREIGN KEY ("${this._name}_id") REFERENCES ${this._name}(id),
            FOREIGN KEY ("${field.table}_id") REFERENCES ${field.table}(id)
          )
        `
        this._db.exec(query)
      }
    }
  }

  private _getExistingColumns = async (): Promise<string[]> => {
    const fields = this._db.prepare(`PRAGMA table_info(${this._name})`).all() as ColumnInfo[]
    return fields.map((field) => field.name)
  }

  private _createView = async () => {
    const columns = this._fields
      .map((field) => {
        if (field.formula) {
          const expandedFormula = this._fields.reduce((acc, f) => {
            const regex = new RegExp(`\\b${f.name}\\b`, 'g')
            return acc.replace(regex, f.formula ? `(${f.formula})` : `"${f.name}"`)
          }, field.formula)
          return `CAST(${expandedFormula} AS ${field.type.toUpperCase()}) AS "${field.name}"`
        } else if (field.type === 'TEXT[]' && field.table) {
          return `(SELECT GROUP_CONCAT("${field.table}_id") FROM ${this._getManyToManyTableName(field.table)} WHERE "${this._name}_id" = ${this._name}.id) AS "${field.name}"`
        } else {
          return `"${field.name}"`
        }
      })
      .join(', ')
    const query = `CREATE VIEW ${this._name}_view AS SELECT ${columns} FROM ${this._name}`
    this._db.exec(query)
  }

  private _preprocess = (values: (string | number | Date | boolean | undefined)[]) => {
    return values.map((value) => {
      if (value instanceof Date) {
        return value.getTime()
      }
      return value
    })
  }

  private _postprocess = (persistedRecord: PersistedDto): PersistedDto => {
    return Object.keys(persistedRecord).reduce((acc: PersistedDto, key) => {
      const value = persistedRecord[key]
      if (value instanceof Date) {
        acc[key] = new Date(value)
      }
      return acc
    }, persistedRecord)
  }

  private _throwError = (error: unknown) => {
    if (error instanceof SqliteError) {
      if (error.code === 'SQLITE_CONSTRAINT_FOREIGNKEY') {
        throw new Error('Key is not present in table.')
      }
    }
    console.error(error)
    throw error
  }
}
