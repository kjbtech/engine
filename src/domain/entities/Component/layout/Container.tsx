import {
  type Base,
  type BaseProps,
  type Breakpoint,
  type Padding,
  type BaseServices,
} from '../base'
import type { Component } from '..'
import type { PageState } from '@domain/entities/Page/State'

export interface Props extends BaseProps {
  children: React.ReactNode
  center?: boolean
  breakpoint?: Breakpoint
  padding?: Padding
}

export type Config = Omit<Props, 'children'>

export type Services = BaseServices

export interface Entities {
  children: Component[]
}

export class Container implements Base<Props> {
  constructor(
    private _config: Config,
    private _services: Services,
    private _entities: Entities
  ) {}

  init = async () => {
    const { children } = this._entities
    await Promise.all(children.map((child) => child.init()))
  }

  render = async (state: PageState) => {
    const { ...defaultProps } = this._config
    const Component = this._services.client.components.Container
    const children = await Promise.all(this._entities.children.map((child) => child.render(state)))
    return (props?: Partial<Props>) => (
      <Component
        {...{
          ...defaultProps,
          children: children.map((Child, index) => <Child key={index} />),
          ...props,
        }}
      />
    )
  }

  validateConfig = () => {
    return []
  }
}
