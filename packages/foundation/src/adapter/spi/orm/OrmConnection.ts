import { Orm } from '@adapter/spi/orm/Orm'
import { RecordDto } from '../../api/app/dtos/RecordDto'
import { FilterDto } from '../../api/app/dtos/FilterDto'
import { TableDto } from '@adapter/api/table/dtos/TableDto'

export class OrmConnection {
  constructor(
    private readonly _orm: Orm,
    tablesDto: TableDto[]
  ) {
    this._orm.configure(tablesDto)
  }

  async tableExists(table: string) {
    return this._orm.tableExists(table)
  }

  async create(table: string, recordDto: RecordDto) {
    return this._orm.create(table, recordDto)
  }

  async createMany(table: string, recordsDto: RecordDto[]) {
    return this._orm.createMany(table, recordsDto)
  }

  async update(table: string, recordDto: RecordDto, id: string) {
    return this._orm.softUpdateById(table, recordDto, id)
  }

  async updateMany(table: string, recordsDto: RecordDto[]) {
    return this._orm.softUpdateMany(table, recordsDto)
  }

  async list(table: string, filtersDto: FilterDto[]) {
    return this._orm.list(table, filtersDto)
  }

  async read(table: string, id: string) {
    return this._orm.readById(table, id)
  }
}
