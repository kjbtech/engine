import { deleteFilesRecursively, log, onBunErrors } from '../utils'

log('Start building JS...')

const externals: string[] = [
  'ajv',
  'fs-extra',
  'puppeteer',
  'debug',
  'express',
  'cors',
  'helmet',
  'cookie-parser',
  'react',
  'react-dom',
  'better-sqlite3',
  'kysely',
]

const entrypoints = [
  'src/app.ts',
  'src/role.ts',
  'src/feature.ts',
  'src/page.ts',
  'src/spec.ts',
  'src/table.ts',
]

await deleteFilesRecursively('dist', '.js')

const { success, logs } = await Bun.build({
  target: 'node',
  entrypoints,
  outdir: 'dist',
  splitting: true,
  external: externals,
})
if (!success) onBunErrors('js', logs)

log('✓ JS builded')
