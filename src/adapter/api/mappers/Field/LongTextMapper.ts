import { LongTextField } from '/domain/entities/Field/LongText'
import type { ILongTextField } from '/domain/interfaces/IField/ILongText'

export class LongTextFieldMapper {
  static toEntity = (config: ILongTextField): LongTextField => {
    return new LongTextField(config)
  }
}
