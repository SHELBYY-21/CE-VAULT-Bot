# Canonical appsrc snapshot branch

This branch exists to run `.github/workflows/canonical-appsrc-snapshot.yml`, which reconstructs `appsrc/` exactly as the production build does (bootstrap → 14 patch scripts → appsrc check) and commits the result here as a reviewable, tracked Git snapshot.

Rules:
- The snapshot is generated, never hand-edited.
- The snapshot is review-only: production build behavior is unchanged until a follow-up PR switches the build to the tracked source directly.
- Do not run this workflow on `main` (workflow_dispatch there would commit the snapshot directly to main).

After each snapshot lands here, ORACLE/WITNESS review the diff against the previous snapshot; the next PR folds accepted changes into the canonical source and removes the corresponding patch scripts.