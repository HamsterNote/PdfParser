import type {
  IntermediateDocument,
  IntermediateImage,
  IntermediatePage,
  IntermediateText
} from '@hamster-note/types'

type PreviewText = Pick<
  IntermediateText,
  'content' | 'fontSize' | 'fontFamily' | 'color' | 'polygon'
>

export type DemoPageSummary = {
  number: number
  width: number
  height: number
  textCount: number
  imageCount: number
  previewText: PreviewText[]
}

export type DemoDocumentSnapshot = {
  id: string
  title: string
  pageCount: number
  hasOutline: boolean
  pageNumbers: number[]
  coverAvailable: boolean
  pages: DemoPageSummary[]
}

export type DemoProgressEvent = {
  stage: string
  current: number
  total: number
  [key: string]: unknown
}

export type DemoDiagnosticEvent = {
  type: string
  [key: string]: unknown
}

export type DemoSerializableDocument = Pick<
  IntermediateDocument,
  | 'id'
  | 'title'
  | 'pageCount'
  | 'pageNumbers'
  | 'getPageByPageNumber'
  | 'getPageSizeByPageNumber'
> & {
  outline?: unknown[]
  getOutline?: () => unknown[] | undefined
  getCover?: (scale?: number) => Promise<IntermediateImage | undefined>
}

export type DemoProgressiveSerializer = {
  shell: DemoDocumentSnapshot
  onUpdate: (callback: (snapshot: DemoDocumentSnapshot) => void) => void
  resolve: () => Promise<DemoDocumentSnapshot>
}

export function createProgressiveSerializer(
  intermediate: DemoSerializableDocument,
  options?: {
    onDiagnostic?: (event: DemoDiagnosticEvent) => void
    onProgress?: (event: DemoProgressEvent) => void
  }
): DemoProgressiveSerializer

export function serializeIntermediate(
  intermediate: DemoSerializableDocument
): Promise<DemoDocumentSnapshot>

export type { IntermediatePage }
