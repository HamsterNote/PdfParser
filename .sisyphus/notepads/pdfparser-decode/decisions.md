# Decisions

## Task 2 - PDFKit Renderer Skeleton (2026-04-03)

- Kept `pdfkit` import isolated to `src/services/pdfDocumentRenderer.ts` to satisfy the private-service constraint
- Did not modify `src/index.ts` so the renderer remains an internal implementation detail
- Used a private `appendPlaceholderPages()` helper instead of partial rendering logic, preventing scope creep into Task 3
- Rejected stream failures via `error` listener and converted unknown throw values with `toError()` for consistent promise rejection
