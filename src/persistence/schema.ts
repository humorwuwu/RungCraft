import { z } from 'zod'
import { BASE_DATA_TYPES } from '@/domain/types'

const baseDataTypeSchema = z.enum(BASE_DATA_TYPES)
const literalValueSchema = z.union([z.boolean(), z.number(), z.string()])

const varDeclSchema = z.lazy(() =>
  z.object({
    id: z.string(),
    name: z.string(),
    dataType: dataTypeRefSchema,
    comment: z.string().optional(),
    initialValue: literalValueSchema.optional(),
    retentive: z.boolean().optional(),
  }),
)

const dataTypeRefSchema: z.ZodType<unknown> = z.lazy(() =>
  z.union([
    z.object({ kind: z.literal('base'), type: baseDataTypeSchema }),
    z.object({ kind: z.literal('array'), element: dataTypeRefSchema, length: z.number().int().nonnegative() }),
    z.object({ kind: z.literal('struct'), fields: z.array(varDeclSchema) }),
    z.object({ kind: z.literal('udt'), udtId: z.string() }),
    z.object({ kind: z.literal('instance'), blockId: z.string() }),
  ]),
)

const operandSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('literal'), dataType: baseDataTypeSchema, value: literalValueSchema }),
  z.object({ kind: z.literal('tag'), tagId: z.string() }),
  z.object({ kind: z.literal('dbField'), dbId: z.string(), path: z.array(z.string()) }),
  z.object({ kind: z.literal('local'), blockId: z.string(), varId: z.string(), path: z.array(z.string()).optional() }),
  z.object({ kind: z.literal('instance'), instanceDbId: z.string(), path: z.array(z.string()) }),
  z.object({ kind: z.literal('address'), address: z.string() }),
])

const tagSchema = z.object({
  id: z.string(),
  name: z.string(),
  dataType: dataTypeRefSchema,
  address: z.string().optional(),
  comment: z.string().optional(),
  hmiVisible: z.boolean().optional(),
})

const tagTableSchema = z.object({
  id: z.string(),
  name: z.string(),
  tags: z.array(tagSchema),
})

const dataBlockSchema = z.object({
  id: z.string(),
  number: z.number().int(),
  name: z.string(),
  kind: z.enum(['global', 'instance']),
  instanceOf: z.string().optional(),
  fields: z.array(varDeclSchema),
  retentive: z.boolean().optional(),
})

const udtDefSchema = z.object({
  id: z.string(),
  name: z.string(),
  comment: z.string().optional(),
  fields: z.array(varDeclSchema),
})

const contactNodeSchema = z.object({
  id: z.string(),
  kind: z.literal('contact'),
  variant: z.enum(['NO', 'NC', 'P', 'N']),
  operand: operandSchema,
})

const coilNodeSchema = z.object({
  id: z.string(),
  kind: z.literal('coil'),
  variant: z.enum(['COIL', 'COIL_NEG', 'SET', 'RESET', 'EDGE_P', 'EDGE_N']),
  operand: operandSchema,
})

const boxNodeSchema = z.object({
  id: z.string(),
  kind: z.literal('box'),
  instructionId: z.string(),
  params: z.record(z.string(), operandSchema.optional()),
  en: z.boolean(),
  eno: z.boolean(),
  instanceRef: z.string().optional(),
  label: z.string().optional(),
})

const callNodeSchema = z.object({
  id: z.string(),
  kind: z.literal('call'),
  blockId: z.string(),
  instanceDbId: z.string().optional(),
  instanceRef: operandSchema.optional(),
  bindings: z.record(z.string(), operandSchema.optional()),
  en: z.boolean(),
  eno: z.boolean(),
})

const ladderNodeSchema: z.ZodType<unknown> = z.lazy(() =>
  z.union([
    z.object({ id: z.string(), kind: z.literal('series'), children: z.array(ladderNodeSchema) }),
    z.object({ id: z.string(), kind: z.literal('parallel'), children: z.array(ladderNodeSchema) }),
    contactNodeSchema,
    coilNodeSchema,
    boxNodeSchema,
    callNodeSchema,
  ]),
)

const layoutHintsSchema = z.object({
  branchOrder: z.record(z.string(), z.array(z.number())).optional(),
  gaps: z.record(z.string(), z.number()).optional(),
})

const networkSchema = z.object({
  id: z.string(),
  title: z.string(),
  comment: z.string(),
  root: ladderNodeSchema,
  layoutHints: layoutHintsSchema.optional(),
})

const blockInterfaceSchema = z.object({
  inputs: z.array(varDeclSchema),
  outputs: z.array(varDeclSchema),
  inOuts: z.array(varDeclSchema),
  statics: z.array(varDeclSchema),
  temps: z.array(varDeclSchema),
  returnVar: varDeclSchema.optional(),
})

const programBlockSchema = z.object({
  id: z.string(),
  name: z.string(),
  kind: z.enum(['OB', 'FC', 'FB']),
  number: z.number().int(),
  comment: z.string().optional(),
  interface: blockInterfaceSchema,
  networks: z.array(networkSchema),
})

const watchEntrySchema = z.object({
  id: z.string(),
  operand: operandSchema,
  format: z.string().optional(),
})

const watchTableSchema = z.object({
  id: z.string(),
  name: z.string(),
  entries: z.array(watchEntrySchema),
})

const hmiWidgetSchema = z.object({
  id: z.string(),
  kind: z.enum(['button', 'lamp', 'number', 'text', 'bar']),
  x: z.number(),
  y: z.number(),
  w: z.number(),
  h: z.number(),
  label: z.string().optional(),
  binding: operandSchema.optional(),
  buttonMode: z.enum(['momentary', 'toggle', 'set', 'reset']).optional(),
})

const hmiScreenSchema = z.object({
  id: z.string(),
  name: z.string(),
  widgets: z.array(hmiWidgetSchema),
})

const recipeFieldSchema = z.object({
  id: z.string(),
  name: z.string(),
  binding: operandSchema,
  dataType: dataTypeRefSchema,
})

const recipeRecordSchema = z.object({
  id: z.string(),
  name: z.string(),
  values: z.record(z.string(), literalValueSchema),
})

const recipeSchema = z.object({
  id: z.string(),
  name: z.string(),
  fields: z.array(recipeFieldSchema),
  records: z.array(recipeRecordSchema),
})

const hmiDocumentSchema = z.object({
  screens: z.array(hmiScreenSchema),
  recipes: z.array(recipeSchema),
})

export const projectSchema = z.object({
  schemaVersion: z.number().int(),
  id: z.string(),
  name: z.string(),
  description: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
  settings: z.object({
    scanTimeMs: z.number().positive(),
    memorySizes: z.object({ I: z.number().int().positive(), Q: z.number().int().positive(), M: z.number().int().positive() }),
    locale: z.literal('zh-CN'),
  }),
  tagTables: z.array(tagTableSchema),
  // v1 工程没有 UDT 列表，缺省视为空，保证旧文件可导入。
  userTypes: z.array(udtDefSchema).default([]),
  dataBlocks: z.array(dataBlockSchema),
  blocks: z.array(programBlockSchema),
  watchTables: z.array(watchTableSchema),
  hmi: hmiDocumentSchema,
})

export const projectEnvelopeSchema = z.object({
  fileType: z.literal('lad-project'),
  schemaVersion: z.number().int(),
  protocolCompatible: z.number().int().optional(),
  appVersion: z.string().optional(),
  exportedAt: z.string().optional(),
  project: projectSchema,
})

export type ProjectEnvelope = z.infer<typeof projectEnvelopeSchema>
