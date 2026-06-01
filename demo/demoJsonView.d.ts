export type JsonOutputRenderer = {
  renderData: (data: unknown) => void
  updateData: (data: unknown) => void
  renderMessage: (message: string) => void
  dispose: () => void
}

export function createJsonOutputRenderer(
  outputElement: unknown,
  jsonviewApi?: Record<string, unknown>
): JsonOutputRenderer
