const mockFs = {
  ensureDirSync: jest.fn(),
  ensureFileSync: jest.fn(),
  pathExistsSync: jest.fn(() => true),
  readJsonSync: jest.fn(() => ({ test: true })),
  writeJsonSync: jest.fn(),
  appendFileSync: jest.fn(),
  readFileSync: jest.fn(() => ''),
  writeFileSync: jest.fn(),
  existsSync: jest.fn(() => true),
}

export default mockFs
