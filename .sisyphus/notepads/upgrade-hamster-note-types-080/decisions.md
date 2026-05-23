
## Task 12 unsupported image fallback hardening
- Kept unsupported extraction records as empty-src `IntermediateImage` entries to preserve existing mixed-content expectations while warnings remain visible.
- Avoided objectId on pattern/color operators; only image/XObject-like unsupported operators carry `objectId`.
