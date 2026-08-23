# ShipCheck UI + performance update

## UI
- Darker, deeper neumorphic shadows for tiles/cards.
- Slightly larger cards, radii, spacing, and icon surfaces.
- Wider desktop content/sidebar alignment.
- Preserves the white + mint-green ShipCheck visual language.

## Scanner performance
- GitHub source retrieval now prefers the repository tarball endpoint instead of a full git clone. Static analysis does not need git history.
- Tarball download is streamed and capped at the existing repository size limit.
- Git clone remains as a fallback if the archive route fails.
- File metadata collection is concurrent within each directory.
- Source file reads/parsing use a bounded worker pool.
- Existing two-repository batch concurrency is preserved so the server is not overloaded.


## Scanner quality improvements

- Findings are classified by source context: production, test, fixture, mock, example/demo, or generated.
- Findings in non-production contexts remain visible as review-only evidence but do not reduce the production risk score.
- This prevents ShipCheck's own test fixtures and intentionally vulnerable demo projects from making a self-scan look like a production compromise.
- A bounded AST cache speeds rescans and repeated batch scans without allowing unbounded memory growth.
- Batch scans use three concurrent repository jobs, matching the server scan-slot limit.
- GitHub source archives remain the preferred ingestion path; Git clone is only the fallback.
