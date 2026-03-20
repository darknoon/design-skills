# Design Skills

## Type checking

Before finishing any edit to TypeScript files, run a type check to make sure there are no errors:

```bash
bunx tsc --noEmit -p <path-to-nearest-tsconfig>
```

If a Python project uses type annotations, run `pyright` or `mypy` before finishing edits.

## README

When adding, removing, or changing the usage of a skill, update the repo-level `README.md` to reflect the change.
