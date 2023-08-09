import { ListTableRecords } from './ListTableRecords'
import { Rollup } from '@domain/entities/table/fields/Rollup'
import { Formula } from '@domain/entities/table/fields/Formula'
import { MultipleLinkedRecords } from '@domain/entities/table/fields/MultipleLinkedRecords'
import { runFormula } from '@application/utils/FormulaUtils'
import { App } from '@domain/entities/app/App'
import { OrmGatewayAbstract } from '@application/gateways/OrmGatewayAbstract'
import { Record } from '@domain/entities/app/Record'
import { IsAnyOf } from '@domain/entities/app/filters/IsAnyOf'

export class ReadTableRecord {
  constructor(
    private ormGateway: OrmGatewayAbstract,
    private app: App
  ) {}

  async execute(table: string, id: string): Promise<Record> {
    const record = await this.ormGateway.read(table, id)
    if (!record) throw new Error(`Record ${id} not found`)
    return this.runRecordFormulas(record, table)
  }

  async runRecordFormulas(record: Record, table: string) {
    const fields = this.app.getTableFields(table)
    if (fields.length > 0) {
      for (const field of fields)
        if (field instanceof Rollup) await this.runFieldRollupFormula(record, field, table)
      for (const field of fields)
        if (field instanceof Formula) await this.runFieldFormula(record, field)
    }
    return record
  }

  async runFieldRollupFormula(record: Record, fieldRollup: Rollup, table: string) {
    const { formula } = fieldRollup
    const fields = this.app.getTableFields(table)
    const field = fields.find((f) => f.name === fieldRollup.linkedRecords)
    if (!field || !(field instanceof MultipleLinkedRecords)) throw new Error('Field not found')
    const listTableGateway = new ListTableRecords(this.ormGateway, this.app)
    const values = record.getFieldValue(field.name)
    if (!Array.isArray(values)) throw new Error('Values are not an array')
    const linkedRecords = await listTableGateway.execute(field.table, [new IsAnyOf('id', values)])
    const context = {
      values: linkedRecords.map((record) => String(record.getFieldValue(fieldRollup.linkedField))),
    }
    const result = await runFormula(formula, context, this.getFunctions())
    record.setCalculatedFieldValue(fieldRollup.name, result)
  }

  async runFieldFormula(record: Record, fieldFormula: Formula) {
    const { formula } = fieldFormula
    const context = record.fields
    const result = await runFormula(formula, context, this.getFunctions())
    record.setCalculatedFieldValue(fieldFormula.name, result)
  }

  getFunctions(): { [key: string]: string } {
    return {
      sum: String((array: (number | string)[]) => array.reduce((a, b) => Number(a) + Number(b), 0)),
    }
  }
}
