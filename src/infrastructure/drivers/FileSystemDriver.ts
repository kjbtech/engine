import type { Driver } from '@adapter/spi/FileSystemSpi'
import fs from 'fs-extra'

export class FileSystemDriver implements Driver {
  exists = (path: string) => {
    return fs.existsSync(path)
  }
}
