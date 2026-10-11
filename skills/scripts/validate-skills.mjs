import fs from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'

const root = path.resolve(import.meta.dirname, '..', '..')
const skillsRoot = path.join(root, 'skills')
const casesFile = path.join(skillsRoot, 'evals', 'trigger-cases.json')

const expectedSkills = [
  'weapp-tailwindcss',
  'weapp-tailwindcss-custom-build',
  'weapp-tailwindcss-lynx',
  'weapp-tailwindcss-migrate',
  'weapp-tailwindcss-react-native',
  'weapp-tailwindcss-runtime',
  'weapp-tailwindcss-setup',
  'weapp-tailwindcss-troubleshoot',
]

const errors = []

function fail(message) {
  errors.push(message)
}

function parseFrontmatter(source, skillName) {
  const match = source.match(/^---\n([\s\S]*?)\n---\n/)
  if (!match) {
    fail(`${skillName}: SKILL.md 缺少 YAML frontmatter`)
    return { body: source, metadata: {} }
  }

  const metadata = {}
  for (const line of match[1].split('\n')) {
    const separator = line.indexOf(':')
    if (separator < 1) {
      fail(`${skillName}: 无法解析 frontmatter 行 ${JSON.stringify(line)}`)
      continue
    }
    metadata[line.slice(0, separator).trim()] = line.slice(separator + 1).trim()
  }

  return {
    body: source.slice(match[0].length),
    metadata,
  }
}

function parseQuotedYamlValue(source, key) {
  const match = source.match(new RegExp(`^\\s*${key}:\\s*"([^"]*)"\\s*$`, 'm'))
  return match?.[1]
}

async function validateSkill(skillName) {
  const skillDir = path.join(skillsRoot, skillName)
  const skillFile = path.join(skillDir, 'SKILL.md')
  const agentFile = path.join(skillDir, 'agents', 'openai.yaml')
  const source = await fs.readFile(skillFile, 'utf8')
  const { body, metadata } = parseFrontmatter(source, skillName)
  const metadataKeys = Object.keys(metadata).sort()

  if (metadataKeys.join(',') !== 'description,name') {
    fail(`${skillName}: frontmatter 只能包含 name 和 description`)
  }
  if (metadata.name !== skillName) {
    fail(`${skillName}: frontmatter name 必须与目录名一致`)
  }
  if (!/^[a-z0-9-]{1,63}$/.test(skillName)) {
    fail(`${skillName}: 名称不符合 lowercase-hyphen 规则`)
  }
  if (!metadata.description || !/Use (?:for|when)/i.test(metadata.description)) {
    fail(`${skillName}: description 必须包含英文触发语义`)
  }
  if (!metadata.description || !/[\u3400-\u9fff]/.test(metadata.description)) {
    fail(`${skillName}: description 必须包含中文触发语义`)
  }
  if (source.includes('TODO')) {
    fail(`${skillName}: 仍包含 TODO 占位`)
  }
  if (source.split('\n').length > 500) {
    fail(`${skillName}: SKILL.md 超过 500 行`)
  }

  for (const match of body.matchAll(/\]\((references\/[^)#]+)(?:#[^)]*)?\)/g)) {
    const reference = path.join(skillDir, match[1])
    try {
      await fs.access(reference)
    }
    catch {
      fail(`${skillName}: reference 不存在: ${match[1]}`)
    }
  }

  let agentSource = ''
  try {
    agentSource = await fs.readFile(agentFile, 'utf8')
  }
  catch {
    fail(`${skillName}: 缺少 agents/openai.yaml`)
    return
  }

  const displayName = parseQuotedYamlValue(agentSource, 'display_name')
  const shortDescription = parseQuotedYamlValue(agentSource, 'short_description')
  const defaultPrompt = parseQuotedYamlValue(agentSource, 'default_prompt')
  if (!displayName) {
    fail(`${skillName}: openai.yaml 缺少 display_name`)
  }
  if (!shortDescription || [...shortDescription].length < 25 || [...shortDescription].length > 64) {
    fail(`${skillName}: short_description 必须为 25-64 个字符`)
  }
  if (!defaultPrompt?.includes(`$${skillName}`)) {
    fail(`${skillName}: default_prompt 必须包含 $${skillName}`)
  }
  if (!defaultPrompt || !/[\u3400-\u9fff]/.test(defaultPrompt) || !/\bUse\b/i.test(defaultPrompt)) {
    fail(`${skillName}: default_prompt 必须同时包含中英文任务提示`)
  }
}

async function validateTriggerCases() {
  const payload = JSON.parse(await fs.readFile(casesFile, 'utf8'))
  if (payload.version !== 1 || !Array.isArray(payload.cases)) {
    fail('trigger-cases.json: 需要 version=1 和 cases 数组')
    return
  }

  const ids = new Set()
  const positiveCounts = new Map(expectedSkills.map(name => [name, 0]))
  for (const item of payload.cases) {
    if (!item.id || ids.has(item.id)) {
      fail(`trigger-cases.json: id 缺失或重复: ${item.id}`)
    }
    ids.add(item.id)
    if (!['positive', 'boundary', 'negative'].includes(item.kind)) {
      fail(`${item.id}: kind 必须是 positive/boundary/negative`)
    }
    if (typeof item.prompt !== 'string' || item.prompt.length < 10) {
      fail(`${item.id}: prompt 过短`)
    }
    if (item.expectedSkill !== null && !expectedSkills.includes(item.expectedSkill)) {
      fail(`${item.id}: expectedSkill 不存在`)
    }
    if (item.kind === 'positive' && item.expectedSkill) {
      positiveCounts.set(item.expectedSkill, positiveCounts.get(item.expectedSkill) + 1)
    }
  }

  for (const [skillName, count] of positiveCounts) {
    if (count < 2) {
      fail(`${skillName}: 至少需要 2 个 positive trigger case`)
    }
  }
}

async function main() {
  const entries = await fs.readdir(skillsRoot, { withFileTypes: true })
  const actualSkills = []
  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue
    }
    try {
      await fs.access(path.join(skillsRoot, entry.name, 'SKILL.md'))
      actualSkills.push(entry.name)
    }
    catch {
      // scripts、evals 等仓库支持目录不是 skill。
    }
  }
  actualSkills.sort()

  if (actualSkills.join(',') !== expectedSkills.join(',')) {
    fail(`skill 目录不匹配: expected=${expectedSkills.join(',')} actual=${actualSkills.join(',')}`)
  }

  await Promise.all(expectedSkills.map(validateSkill))
  await validateTriggerCases()

  if (errors.length > 0) {
    for (const error of errors) {
      console.error(`- ${error}`)
    }
    process.exitCode = 1
    return
  }

  console.log(`Validated ${expectedSkills.length} skills and trigger cases.`)
}

await main()
