import { RecordDto } from '@application/dtos/RecordDto'
import { Record } from '@domain/entities/Record'

export function mapDtoToRecord(table: string, recordDto: RecordDto): Record {
  const { id, last_modified_time, created_time, ...fields } = recordDto
  return new Record(
    table,
    fields,
    String(id),
    created_time ? String(created_time) : undefined,
    last_modified_time ? String(last_modified_time) : undefined
  )
}

export function mapRecordToDto(record: Record): RecordDto {
  const { id, created_time, last_modified_time, fields } = record
  return { ...fields, id, created_time, last_modified_time }
}
