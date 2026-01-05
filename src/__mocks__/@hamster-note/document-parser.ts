// Mock for @hamster-note/document-parser
import type { IntermediateDocument } from './types'

export type ParserInput = ArrayBuffer | ArrayBufferView | Blob

export interface DocumentAnchorWithTextId {
  pageId: string
  textId?: string
}

export interface DocumentAnchorWithPosition {
  pageId: string
  position: { x: number; y: number }
}

export type DocumentAnchor =
  | DocumentAnchorWithPosition
  | DocumentAnchorWithTextId

export abstract class DocumentParser {
  static readonly exts: readonly string[] = []

  /**
   * 将原始输入解析为中间文档结构。
   */
  abstract encode(input: ParserInput): Promise<IntermediateDocument>

  /**
   * 可选：从中间文档逆序列化回原始文件数据。
   */
  decode(_intermediateDocument: IntermediateDocument): Promise<ParserInput> {
    return Promise.resolve(new ArrayBuffer(0))
  }

  protected static toArrayBuffer = async (
    input: ParserInput
  ): Promise<ArrayBuffer> => {
    if (input instanceof ArrayBuffer) {
      return input
    }
    if (ArrayBuffer.isView(input)) {
      return input.buffer.slice(
        input.byteOffset,
        input.byteOffset + input.byteLength
      )
    }
    if (input instanceof Blob) {
      return input.arrayBuffer()
    }
    throw new Error('Unsupported input type')
  }

  protected static toUint8Array = async (
    input: ParserInput
  ): Promise<Uint8Array> => {
    const buffer = await DocumentParser.toArrayBuffer(input)
    return new Uint8Array(buffer)
  }
}

export const registerDocumentParser = (): void => {
  // Mock implementation
}
