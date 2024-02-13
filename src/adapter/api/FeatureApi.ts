import { FeatureMapper, type Params } from './mappers/FeatureMapper'
import { Feature } from '@domain/engine/Feature'
import type { Params as SpisParams } from '@adapter/spi'
import { Base } from './base'
import type { Feature as Config } from './configs/Feature'
import { AppMapper } from './mappers/AppMapper'
import type { TestError } from '@domain/entities/error/Test'

export class FeatureApi extends Base<Config, Feature, Params> {
  constructor(params: SpisParams) {
    super(params, FeatureMapper, 'feature')
  }

  test = async (config: unknown): Promise<TestError[]> => {
    if (!this.validate(config)) throw new Error('Invalid config')
    const feature = this.mapper.toEntityFromServices(config, this.services)
    return feature.test(() => AppMapper.featureToEntityFromServices(config, this.services))
  }
}
