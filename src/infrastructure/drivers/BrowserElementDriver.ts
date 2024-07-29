import type { Driver } from '@adapter/spi/BrowserElementSpi'
import type { ElementHandle, Page } from 'puppeteer'

export class BrowserElementDriver implements Driver {
  constructor(
    private _page: Page,
    private _element: ElementHandle<globalThis.Node>
  ) {}

  getAttribute = async (attribute: string) => {
    return this._page.evaluate(
      (el, attr) => (el as HTMLElement).getAttribute(attr) ?? undefined,
      this._element,
      attribute
    )
  }

  getInputValue = async () => {
    return this._page.evaluate((el) => (el as HTMLInputElement).value ?? undefined, this._element)
  }
}
