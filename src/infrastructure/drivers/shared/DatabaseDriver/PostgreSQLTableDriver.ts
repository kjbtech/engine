import pg from 'pg'
import type { IDatabaseTableDriver } from '@adapter/spi/drivers/DatabaseTableSpi'
import type { FilterDto } from '@domain/entities/Filter'
import type { RecordFields, RecordFieldValue } from '@domain/entities/Record'
import type {
  PersistedRecordFieldsDto,
  RecordFieldsToCreateDto,
  RecordFieldsToUpdateDto,
} from '@adapter/spi/dtos/RecordDto'
import type { ITable } from '@domain/interfaces/ITable'
import type { IField } from '@domain/interfaces/IField'

interface ColumnInfo {
  name: string
  type: string
  notnull: number
}

interface Column {
  name: string
  type: 'TEXT' | 'TIMESTAMP' | 'NUMERIC' | 'BOOLEAN' | 'TEXT[]'
  formula?: string
  options?: string[]
  required?: boolean
  table?: string
  tableField?: string
  onMigration?: {
    replace?: string
  }
}

type Row = {
  id: string
  created_at: Date
  updated_at?: Date
  [key: string]: RecordFieldValue
}

export class PostgreSQLDatabaseTableDriver implements IDatabaseTableDriver {
  public name: string
  public viewName: string
  public fields: IField[] = []
  public columns: Column[]

  constructor(
    config: ITable,
    private _db: pg.Pool
  ) {
    this.name = config.name
    this.viewName = `${config.name}_view`
    this.fields = [
      ...config.fields,
      {
        name: 'id',
        type: 'SingleLineText',
        required: true,
      },
      {
        name: 'created_at',
        type: 'DateTime',
        required: true,
      },
      {
        name: 'updated_at',
        type: 'DateTime',
      },
    ]
    this.columns = this.fields.map(this._convertFieldToColumn)
  }

  exists = async () => {
    const result = await this._db.query(
      `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name = $1`,
      [this.name]
    )
    return result.rows.length > 0
  }

  create = async () => {
    const exists = await this.exists()
    if (exists) throw new Error(`Table "${this.name}" already exists`)
    const [schema, table] = this.name.includes('.') ? this.name.split('.') : ['public', this.name]
    if (schema !== 'public') {
      const createSchemaQuery = `CREATE SCHEMA IF NOT EXISTS ${schema}`
      await this._db.query(createSchemaQuery)
    }
    const tableColumns = this._buildColumnsQuery(this.columns)
    const tableQuery = `CREATE TABLE ${schema}.${table} (${tableColumns})`
    await this._db.query(tableQuery)
    await this._createManyToManyTables()
  }

  migrate = async () => {
    const existingColumns = await this._getExistingColumns()
    const staticColumns = this.columns.filter((column) => !this._isViewColumn(column))
    const fieldsToAdd = staticColumns.filter(
      (field) =>
        !existingColumns.some(
          (column) =>
            column.name === field.name ||
            (field.onMigration && field.onMigration.replace === column.name)
        )
    )
    const fieldsToAlter = staticColumns.filter((field) => {
      const existingColumn = existingColumns.find(
        (column) =>
          column.name === field.name ||
          (field.onMigration && field.onMigration.replace === column.name)
      )
      if (!existingColumn) return false
      return (
        existingColumn.type !== field.type ||
        existingColumn.notnull !== (field.required ? 1 : 0) ||
        (field.onMigration && field.onMigration.replace)
      )
    })
    for (const field of fieldsToAdd) {
      const [column, reference] = this._buildColumnsQuery([field]).split(',')
      const query = `ALTER TABLE ${this.name} ADD COLUMN ${column}`
      this._db.query(query)
      if (reference) {
        this._db.query(`ALTER TABLE ${this.name} ADD CONSTRAINT fk_${field.name} ${reference}`)
      }
    }
    for (const field of fieldsToAlter) {
      if (field.onMigration && field.onMigration.replace) {
        const existingColumnWithNewName = existingColumns.find(
          (column) => column.name === field.name
        )
        if (!existingColumnWithNewName) {
          const renameQuery = `ALTER TABLE ${this.name} RENAME COLUMN ${field.onMigration.replace} TO ${field.name}`
          await this._db.query(renameQuery)
        }
      }
      const query = `ALTER TABLE ${this.name} ALTER COLUMN ${field.name} TYPE ${field.type}`
      await this._db.query(query)
    }
    await this._createManyToManyTables()
  }

  viewExists = async () => {
    const result = await this._db.query(
      `SELECT table_name FROM information_schema.views WHERE table_schema = 'public' AND table_name = $1`,
      [this.name + '_view']
    )
    return result.rows.length > 0
  }

  createView = async () => {
    let joins = ''
    const exists = await this.viewExists()
    if (exists) throw new Error(`View "${this.viewName}" already exists`)
    const columns = this.fields
      .map((field) => {
        const column = this._convertFieldToColumn(field)
        if (field.type === 'Rollup') {
          const linkedRecordField = this._getLinkedRecordField(field.multipleLinkedRecord)
          const values = `${linkedRecordField.table}_view.${field.linkedRecordField}`
          const formula = this._convertFormula(field.formula, values)
          const linkedRecordColumn = this._convertFieldToColumn(linkedRecordField)
          const manyToManyTableName = this._getManyToManyTableName(linkedRecordColumn)
          if (!joins.includes(manyToManyTableName)) {
            joins += ` LEFT JOIN ${manyToManyTableName} ON ${this.name}.id = ${manyToManyTableName}.${this.name}_id`
            joins += ` LEFT JOIN ${linkedRecordField.table}_view ON ${manyToManyTableName}.${linkedRecordField.table}_id = ${linkedRecordField.table}_view.id`
          }
          return `CAST(${formula} AS ${column.type}) AS "${column.name}"`
        } else if (field.type === 'Formula') {
          const expandedFormula = this.columns.reduce((acc, f) => {
            const regex = new RegExp(`\\b${f.name}\\b`, 'g')
            return acc.replace(regex, f.formula ? `(${f.formula})` : `"${f.name}"`)
          }, field.formula)
          return `CAST(${expandedFormula} AS ${column.type.toUpperCase()}) AS "${column.name}"`
        } else if (field.type === 'MultipleLinkedRecord') {
          return `(SELECT ARRAY_AGG("${column.table}_id") FROM ${this._getManyToManyTableName(column)} WHERE "${this.name}_id" = ${this.name}.id) AS "${column.name}"`
        } else {
          return `${this.name}.${column.name} AS "${column.name}"`
        }
      })
      .join(', ')
    let query = `CREATE VIEW ${this.viewName} AS SELECT ${columns} FROM ${this.name}`
    if (joins) query += joins + ` GROUP BY ${this.name}.id`
    await this._db.query(query)
  }

  dropView = async () => {
    const query = `DROP VIEW IF EXISTS ${this.viewName}`
    await this._db.query(query)
  }

  insert = async <T extends RecordFields>(record: RecordFieldsToCreateDto<T>) => {
    const client = await this._db.connect()
    try {
      client.query('BEGIN')
      await this._insert<T>(client, record)
      client.query('COMMIT')
    } catch (e) {
      client.query('ROLLBACK')
      this._throwError(e)
    } finally {
      client.release()
    }
  }

  insertMany = async <T extends RecordFields>(records: RecordFieldsToCreateDto<T>[]) => {
    const client = await this._db.connect()
    try {
      client.query('BEGIN')
      for (const record of records) await this._insert<T>(client, record)
      client.query('COMMIT')
    } catch (e) {
      client.query('ROLLBACK')
      this._throwError(e)
    } finally {
      client.release()
    }
  }

  update = async <T extends RecordFields>(record: RecordFieldsToUpdateDto<T>) => {
    const client = await this._db.connect()
    try {
      client.query('BEGIN')
      await this._update<T>(client, record)
      client.query('COMMIT')
    } catch (e) {
      client.query('ROLLBACK')
      this._throwError(e)
    } finally {
      client.release()
    }
  }

  updateMany = async <T extends RecordFields>(records: RecordFieldsToUpdateDto<T>[]) => {
    const client = await this._db.connect()
    try {
      client.query('BEGIN')
      for (const record of records) await this._update<T>(client, record)
      client.query('COMMIT')
    } catch (e) {
      client.query('ROLLBACK')
      this._throwError(e)
    } finally {
      client.release()
    }
  }

  delete = async (id: string) => {
    try {
      const values = [id]
      const query = `DELETE FROM ${this.name} WHERE id = $1`
      await this._db.query(query, values)
    } catch (e) {
      this._throwError(e)
    }
  }

  read = async <T extends RecordFields>(filter: FilterDto) => {
    const { conditions, values } = this._convertFilterToConditions(filter)
    if (!conditions) return
    const query = `SELECT * FROM ${this.viewName} WHERE ${conditions} LIMIT 1`
    const result = await this._db.query<Row>(query, values)
    if (result.rows.length === 0) return
    return this._postprocess<T>(result.rows[0])
  }

  readById = async <T extends RecordFields>(id: string) => {
    const query = `SELECT * FROM ${this.viewName} WHERE id = $1`
    const result = await this._db.query<Row>(query, [id])
    if (result.rows.length === 0) return
    return this._postprocess<T>(result.rows[0])
  }

  list = async <T extends RecordFields>(filter?: FilterDto) => {
    const { conditions, values } = filter
      ? this._convertFilterToConditions(filter)
      : { conditions: '', values: [] }
    if (!conditions) {
      const query = `SELECT * FROM ${this.viewName}`
      const result = await this._db.query<Row>(query)
      return result.rows.map(this._postprocess<T>)
    }
    const query = `SELECT * FROM ${this.viewName} WHERE ${conditions}`
    const result = await this._db.query<Row>(query, values)
    return result.rows.map(this._postprocess<T>)
  }

  private _insert = async <T extends RecordFields>(
    client: pg.PoolClient,
    record: RecordFieldsToCreateDto<T>
  ) => {
    const { created_at, fields, id } = record
    const preprocessedFields = this._preprocess<T>(fields)
    const { staticColumns, manyToManyColumns } = this._splitFields({
      id,
      created_at,
      ...preprocessedFields,
    })
    const keys = Object.keys(staticColumns)
    const values = Object.values(staticColumns)
    const placeholders = keys.map((_, i) => `$${i + 1}`).join(', ')
    const query = `INSERT INTO ${this.name} (${keys.join(', ')}) VALUES (${placeholders}) RETURNING *`
    await client.query(query, values)
    if (Object.keys(manyToManyColumns).length > 0) {
      await this._insertManyToManyColumns(client, record.id, manyToManyColumns)
    }
  }

  private _update = async <T extends RecordFields>(
    client: pg.PoolClient,
    record: RecordFieldsToUpdateDto<T>
  ) => {
    const { id, updated_at, fields } = record
    const preprocessedFields = this._preprocess<T>(fields)
    const { staticColumns, manyToManyColumns } = this._splitFields({
      id,
      updated_at,
      ...preprocessedFields,
    })
    const keys = Object.keys(staticColumns)
    const values = Object.values(staticColumns)
    const setString = keys.map((key, i) => `${key} = $${i + 1}`).join(', ')
    const query = `UPDATE ${this.name} SET ${setString} WHERE id = $${keys.length + 1} RETURNING *`
    await client.query(query, [...values, record.id])
    if (Object.keys(manyToManyColumns).length > 0) {
      await this._updateManyToManyColumns(client, record.id, manyToManyColumns)
    }
  }

  private _buildColumnsQuery = (columns: Column[]) => {
    const columnsQueries = []
    const references = []
    for (const column of columns) {
      if (this._isViewColumn(column)) continue
      let query = `"${column.name}" ${column.type}`
      if (column.name === 'id') {
        query += ' PRIMARY KEY'
      } else if (column.options) {
        query += ` CHECK ("${column.name}" IN ('${column.options.join("', '")}'))`
      } else if (column.table) {
        references.push(`FOREIGN KEY ("${column.name}") REFERENCES ${column.table}(id)`)
      }
      if (column.required) {
        query += ' NOT NULL'
      }
      columnsQueries.push(query)
    }
    columnsQueries.push(...references)
    return columnsQueries.join(', ')
  }

  private _slugify = (text: string) => {
    return text
      .toString()
      .toLowerCase()
      .trim()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '_')
      .replace(/-+/g, '_')
  }

  private _getManyToManyTableName = (column: Column) => {
    return [this.name, column.table].sort().join('_') + '_' + this._slugify(column.name)
  }

  private _createManyToManyTables = async () => {
    for (const column of this.columns) {
      if (column.type === 'TEXT[]' && column.table) {
        const manyToManyTableName = this._getManyToManyTableName(column)
        const query = `
          CREATE TABLE IF NOT EXISTS ${manyToManyTableName} (
            "${this.name}_id" TEXT NOT NULL,
            "${column.table}_id" TEXT NOT NULL,
            FOREIGN KEY ("${this.name}_id") REFERENCES ${this.name}(id),
            FOREIGN KEY ("${column.table}_id") REFERENCES ${column.table}(id)
          )
        `
        await this._db.query(query)
      }
    }
  }

  private _splitFields = (row: Partial<Row>) => {
    const staticColumns: { [key: string]: RecordFieldValue } = {}
    const manyToManyColumns: { [key: string]: string[] } = {}
    for (const [key, value] of Object.entries(row)) {
      const field = this.columns.find((f) => f.name === key)
      if (field?.type === 'TEXT[]' && field.table && Array.isArray(value)) {
        manyToManyColumns[key] = value
      } else {
        staticColumns[key] = value
      }
    }
    return { staticColumns, manyToManyColumns }
  }

  private _insertManyToManyColumns = async (
    client: pg.PoolClient,
    recordId: string,
    manyToManyColumns: { [key: string]: string[] }
  ) => {
    for (const [columnName, ids] of Object.entries(manyToManyColumns)) {
      const column = this.columns.find((f) => f.name === columnName)
      const tableName = column?.table
      if (!tableName) throw new Error('Table name not found.')
      const manyToManyTableName = this._getManyToManyTableName(column)
      for (const id of ids) {
        const query = `INSERT INTO ${manyToManyTableName} ("${this.name}_id", "${tableName}_id") VALUES ($1, $2)`
        await client.query(query, [recordId, id])
      }
    }
  }

  private _updateManyToManyColumns = async (
    client: pg.PoolClient,
    recordId: string,
    manyToManyColumns: { [key: string]: string[] }
  ) => {
    for (const [columnName, ids] of Object.entries(manyToManyColumns)) {
      const column = this.columns.find((f) => f.name === columnName)
      const tableName = column?.table
      if (!tableName) throw new Error('Table name not found.')
      const manyToManyTableName = this._getManyToManyTableName(column)
      const deleteQuery = `DELETE FROM ${manyToManyTableName} WHERE "${this.name}_id" = $1`
      await client.query(deleteQuery, [recordId])
      for (const id of ids) {
        const query = `INSERT INTO ${manyToManyTableName} ("${this.name}_id", "${tableName}_id") VALUES ($1, $2)`
        await client.query(query, [recordId, id])
      }
    }
  }

  private _isViewColumn = (column: Column) => {
    return column.formula || (column.type === 'TEXT[]' && column.table)
  }

  private _convertFormula(formula: string, values: string) {
    const patterns = [
      { pattern: /CONCAT\(values\)/g, replacement: "STRING_AGG(values, ',')" },
      { pattern: /CONCAT\(values, '([^']*)'\)/g, replacement: "STRING_AGG(values, '$1')" },
    ]
    patterns.forEach(({ pattern, replacement }) => {
      formula = formula.replace(pattern, replacement)
    })
    return formula.replace(/\bvalues\b/g, values)
  }

  private _getExistingColumns = async (): Promise<ColumnInfo[]> => {
    const result = await this._db.query(
      `SELECT column_name as name, data_type as type, is_nullable as notnull FROM information_schema.columns WHERE table_schema = 'public' AND table_name = $1`,
      [this.name]
    )
    return result.rows
  }

  private _preprocess = <T extends RecordFields>(record: Partial<T>): RecordFields => {
    return Object.keys(record).reduce((acc: RecordFields, key) => {
      const value = record[key]
      const column = this.columns.find((f) => f.name === key)
      if (value === undefined || value === null) return acc
      if (key in acc) {
        if (column?.type === 'TIMESTAMP') {
          if (value instanceof Date) acc[key] = value
          else acc[key] = new Date(String(value))
        }
      }
      return acc
    }, record)
  }

  private _postprocess = <T extends RecordFields>(row: Row): PersistedRecordFieldsDto<T> => {
    const { id, created_at, updated_at, ...columnsToProcess } = row
    const fields = Object.keys(columnsToProcess).reduce((acc: RecordFields, key) => {
      const value = row[key]
      const field = this.fields.find((f) => f.name === key)
      if (!field) throw new Error(`Field "${key}" not found`)
      switch (field.type) {
        case 'MultipleLinkedRecord':
          acc[key] = value ? String(value).split(',') : []
          break
        case 'Rollup':
          if (field.output.type === 'Number') {
            acc[key] = value ? Number(value) : 0
          } else {
            acc[key] = value
          }
          break
        default:
          acc[key] = value
      }
      return acc
    }, columnsToProcess) as T
    return {
      id,
      created_at,
      updated_at,
      fields,
    }
  }

  private _convertFilterToConditions = (
    filter: FilterDto,
    index = 1
  ): { conditions: string; values: (string | number)[]; index: number } => {
    const values: (string | number)[] = []
    if ('and' in filter) {
      const conditions = filter.and.map((f) => {
        const {
          conditions,
          values: filterValues,
          index: filterIndex,
        } = this._convertFilterToConditions(f, index)
        index = filterIndex
        values.push(...filterValues)
        return `(${conditions})`
      })
      return { conditions: conditions.join(' AND '), values, index }
    } else if ('or' in filter) {
      const conditions = filter.or.map((f) => {
        const {
          conditions,
          values: filterValues,
          index: filterIndex,
        } = this._convertFilterToConditions(f, index)
        index = filterIndex
        values.push(...filterValues)
        return `(${conditions})`
      })
      return { conditions: conditions.join(' OR '), values, index }
    }
    const { operator } = filter
    switch (operator) {
      case 'Is':
        return {
          conditions: `"${filter.field}" = $${index}`,
          values: [filter.value],
          index: index + 1,
        }
      case 'Contains':
        return {
          conditions: `"${filter.field}" ILIKE $${index}`,
          values: [`%${filter.value}%`],
          index: index + 1,
        }
      case 'Equals':
        return {
          conditions: `"${filter.field}" = $${index}`,
          values: [filter.value],
          index: index + 1,
        }
      case 'IsAnyOf':
        return {
          conditions: `"${filter.field}" IN (${filter.value.map((_, i) => `$${i + index}`).join(', ')})`,
          values: filter.value,
          index: index + filter.value.length,
        }
      case 'OnOrAfter':
        return {
          conditions: `"${filter.field}" >= $${index}::timestamp`,
          values: [filter.value],
          index: index + 1,
        }
      case 'IsFalse':
        return {
          conditions: `"${filter.field}" is false`,
          values: [],
          index,
        }
      case 'IsTrue':
        return {
          conditions: `"${filter.field}" is true`,
          values: [],
          index,
        }
      default:
        throw new Error(`Unsupported operator: ${operator}`)
    }
  }

  private _getLinkedRecordField = (name: string) => {
    const linkedRecord = this.fields.find((f) => f.name === name)
    if (!linkedRecord || linkedRecord.type !== 'MultipleLinkedRecord')
      throw new Error('Linked record not found')
    return linkedRecord
  }
  private _convertFieldToColumn = (field: IField): Column => {
    const column = {
      name: field.name,
      required: field.required,
      onMigration: field.onMigration,
    }
    let rollupTable: string | undefined
    if (field.type === 'Rollup') {
      rollupTable = this._getLinkedRecordField(field.multipleLinkedRecord).table
    }
    switch (field.type) {
      case 'SingleLineText':
        return {
          ...column,
          type: 'TEXT',
        }
      case 'LongText':
        return {
          ...column,
          type: 'TEXT',
        }
      case 'Email':
        return {
          ...column,
          type: 'TEXT',
        }
      case 'DateTime':
        return {
          ...column,
          type: 'TIMESTAMP',
        }
      case 'Number':
        return {
          ...column,
          type: 'NUMERIC',
        }
      case 'Formula':
        return {
          ...column,
          type: this._convertFieldToColumn({ name: field.name, ...field.output }).type,
          formula: field.formula,
        }
      case 'Checkbox':
        return {
          ...column,
          type: 'BOOLEAN',
        }
      case 'SingleSelect':
        return {
          ...column,
          type: 'TEXT',
          options: field.options,
        }
      case 'SingleLinkedRecord':
        return {
          ...column,
          type: 'TEXT',
          table: field.table,
        }
      case 'MultipleLinkedRecord':
        return {
          ...column,
          type: 'TEXT[]',
          table: field.table,
        }
      case 'Rollup':
        return {
          ...column,
          type: this._convertFieldToColumn({ name: field.name, ...field.output }).type,
          formula: field.formula,
          table: rollupTable,
          tableField: field.linkedRecordField,
        }
    }
  }

  private _throwError = (error: unknown) => {
    if (error instanceof Error) {
      if (error.message.includes('unique constraint')) {
        throw new Error('Record id already exists')
      }
      if (error.message.includes('foreign key constraint')) {
        throw new Error('Invalid linked record')
      }
    }
    throw error
  }
}
