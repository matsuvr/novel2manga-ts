Codemod: Convert HttpError usage to ApiError
===========================================

What it does
- Replace imports from utils/http-errors
- Convert `new HttpError(...)` and subclasses to `new ApiError(message, status, code?, details?)`
- Replace `instanceof HttpError` with `instanceof ApiError`
- Replace TS type references `HttpError` -> `ApiError` (best effort)

Dry run (all src/)
```
npm run codemod:http-error:dry
```

Apply (all src/)
```
npm run codemod:http-error
```

Notes
- Review diffs. Some complex option objects may need manual touch-ups.
- If your code uses custom subclasses of HttpError, map them to ApiError with appropriate status.
