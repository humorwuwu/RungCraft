import { nanoid } from 'nanoid'

/** 生成带前缀的短 ID，前缀便于调试与导出文件可读。 */
export function newId(prefix: string): string {
  return `${prefix}_${nanoid(8)}`
}
