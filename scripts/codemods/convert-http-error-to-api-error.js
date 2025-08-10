// Codemod: Convert usages of HttpError and its subclasses to ApiError
//
// What it does:
// - Replaces imports from any utils/http-errors with ApiError import from '@/utils/api-error'
// - Transforms `new HttpError(...)` and subclass news to `new ApiError(message, status, code?, details?)`
// - Rewrites `x instanceof HttpError` to `x instanceof ApiError`
// - Rewrites TypeScript type references `HttpError` to `ApiError` (best effort)
//
// Status mapping:
// - BadRequestError -> 400
// - NotFoundError -> 404
// - UnauthorizedError -> 401
// - ForbiddenError -> 403
// - ConflictError -> 409
// - HttpError (base) -> preserves explicit status or defaults to 500
//
// Usage (dry-run):
//   npx jscodeshift -d -p -t scripts/codemods/convert-http-error-to-api-error.js src/app/api/**/*.ts?(x)
//
// Apply:
//   npx jscodeshift -t scripts/codemods/convert-http-error-to-api-error.js src/app/api/**/*.ts?(x)

/** @type {import('jscodeshift').Transform} */
module.exports = function transformer(file, api) {
  const j = api.jscodeshift
  const root = j(file.source)

  const HTTP_ERRORS_MODULE_MATCHERS = new Set([
    '@/utils/http-errors',
    'src/utils/http-errors',
    './src/utils/http-errors',
  ])

  function isHttpErrorsModule(value) {
    if (!value || typeof value !== 'string') return false
    if (HTTP_ERRORS_MODULE_MATCHERS.has(value)) return true
    // relative variants like ../utils/http-errors or ./utils/http-errors
    if (/(^|\/)utils\/http-errors$/.test(value)) return true
    return false
  }

  // Collect whether ApiError is already imported
  function hasApiErrorImport() {
    return root
      .find(j.ImportDeclaration, {
        source: { value: (v) => typeof v === 'string' && /\/utils\/api-error$/.test(v) },
      })
      .some((path) => {
        const spec = path.value.specifiers || []
        return spec.some(
          (s) => s.type === 'ImportSpecifier' && s.imported && s.imported.name === 'ApiError',
        )
      })
  }

  function ensureApiErrorImport() {
    if (hasApiErrorImport()) return
    // Insert: import { ApiError } from '@/utils/api-error'
    const importDecl = j.importDeclaration(
      [j.importSpecifier(j.identifier('ApiError'))],
      j.literal('@/utils/api-error'),
    )
    const firstImport = root.find(j.ImportDeclaration).at(0)
    if (firstImport.size() > 0) {
      firstImport.insertBefore(importDecl)
    } else {
      root.get().node.program.body.unshift(importDecl)
    }
  }

  // 1) Replace/delete imports from http-errors
  let touched = false
  root.find(j.ImportDeclaration).forEach((path) => {
    const sourceVal = path.value.source?.value
    if (isHttpErrorsModule(sourceVal)) {
      // Remove this import entirely; we convert usages below
      j(path).remove()
      touched = true
    }
  })

  // 2) Replace `new XxxError(...)` with `new ApiError(...)`
  const subclassStatus = new Map([
    ['BadRequestError', 400],
    ['NotFoundError', 404],
    ['UnauthorizedError', 401],
    ['ForbiddenError', 403],
    ['ConflictError', 409],
  ])

  function buildApiErrorArgs(originalCalleeName, args) {
    const [msgArg, secondArg, thirdArg] = args

    // Determine status
    let statusExpr = null
    if (originalCalleeName === 'HttpError') {
      if (secondArg && secondArg.type !== 'ObjectExpression') {
        statusExpr = secondArg
      } else {
        statusExpr = j.literal(500)
      }
    } else {
      const mapped = subclassStatus.get(originalCalleeName)
      statusExpr = j.literal(mapped || 500)
    }

    // Determine options object (may be second or third arg for base HttpError)
    let optionsArg = null
    if (originalCalleeName === 'HttpError') {
      if (thirdArg) optionsArg = thirdArg
      else if (secondArg && secondArg.type === 'ObjectExpression') optionsArg = secondArg
    } else {
      if (secondArg && secondArg.type === 'ObjectExpression') optionsArg = secondArg
    }

    // code: options?.code
    const codeArg = optionsArg
      ? j.optionalMemberExpression(optionsArg, j.identifier('code'), false, true)
      : null

    // details: options?.details
    const detailsArg = optionsArg
      ? j.optionalMemberExpression(optionsArg, j.identifier('details'), false, true)
      : null

    // Only include codeArg and detailsArg if they are present
    const finalArgs = [msgArg || j.literal('Error'), statusExpr]
    if (codeArg) finalArgs.push(codeArg)
    if (detailsArg) finalArgs.push(detailsArg)
    return finalArgs
  }

  root
    .find(
      j.NewExpression,
      (n) =>
        n.callee &&
        n.callee.type === 'Identifier' &&
        (n.callee.name === 'HttpError' || subclassStatus.has(n.callee.name)),
    )
    .forEach((p) => {
      const calleeName = p.value.callee.name
      const args = p.value.arguments
      const apiArgs = buildApiErrorArgs(calleeName, args)
      j(p).replaceWith(j.newExpression(j.identifier('ApiError'), apiArgs))
      touched = true
    })

  // 3) Replace `instanceof HttpError` with `instanceof ApiError`
  root
    .find(j.BinaryExpression, { operator: 'instanceof' })
    .filter((p) => p.value.right.type === 'Identifier' && p.value.right.name === 'HttpError')
    .forEach((p) => {
      p.value.right = j.identifier('ApiError')
      touched = true
    })

  // 4) Replace TS type references `HttpError` -> `ApiError`
  root
    .find(
      j.TSTypeReference,
      (n) => n.typeName && n.typeName.type === 'Identifier' && n.typeName.name === 'HttpError',
    )
    .forEach((p) => {
      p.value.typeName = j.identifier('ApiError')
      touched = true
    })

  if (touched) {
    ensureApiErrorImport()
    return root.toSource({ quote: 'single', trailingComma: true })
  }
  return null
}
