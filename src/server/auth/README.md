# Authentication Guard - Effect TS Implementation

This module provides type-safe authentication guards using Effect TS for the Novel2Manga application.

## Features

- **Type-safe authentication**: Uses Effect TS for composable, type-safe authentication flows
- **Development bypass**: Configurable bypass functionality for development and testing
- **Error handling**: Structured error types with automatic API response conversion
- **Session validation**: Validates NextAuth sessions and extracts user information

## Usage

### Basic Authentication

```typescript
import { Effect } from 'effect'
import { requireAuth, effectToApiResponse } from '@/server/auth'

export async function GET() {
  const effect = Effect.gen(function* () {
    // Require authentication - fails with AuthenticationError if not authenticated
    const user = yield* requireAuth

    // Use authenticated user data
    return { message: `Hello ${user.name}!`, userId: user.id }
  })

  return effectToApiResponse(effect)
}
```

### With Development Bypass

```typescript
import { requireAuthWithBypass, getSearchParamsFromRequest } from '@/server/auth'

export async function GET(request: Request) {
  const effect = Effect.gen(function* () {
    const searchParams = getSearchParamsFromRequest(request)
    const user = yield* requireAuthWithBypass(searchParams)

    return { user }
  })

  return effectToApiResponse(effect)
}
```

### Using the Wrapper Function

```typescript
import { withAuth } from '@/server/auth'

export const GET = withAuth(async (user) => {
  // user is automatically authenticated
  return Effect.succeed({ message: `Hello ${user.name}!` })
})
```

## Environment Variables

### Required for Authentication

- `AUTH_SECRET`: NextAuth secret key
- `AUTH_GOOGLE_ID`: Google OAuth client ID
- `AUTH_GOOGLE_SECRET`: Google OAuth client secret

### Development Bypass

- `ALLOW_ADMIN_BYPASS=true`: Enable bypass functionality (development only)
- `NODE_ENV=development`: Required for bypass to work

## Development Bypass

The bypass functionality allows skipping authentication during development:

1. Set `ALLOW_ADMIN_BYPASS=true` in your `.env` file
2. Add `?admin=true` to your request URL
3. The system will return a mock authenticated user

**Security Notes:**

- Bypass is completely disabled in production (`NODE_ENV=production`)
- Attempting to use bypass in production throws an error
- Bypass usage is logged with warnings

## Error Types

### AuthenticationError

Thrown when authentication fails:

```typescript
class AuthenticationError {
  readonly _tag = 'AuthenticationError'
  constructor(readonly message: string) {}
}
```

### API Error Responses

Automatically converted to appropriate HTTP responses:

- `401 Unauthorized`: Authentication required or failed
- `400 Bad Request`: Validation errors
- `500 Internal Server Error`: Database or server errors

## Testing

The module includes comprehensive tests covering:

- Valid authentication scenarios
- Authentication failures
- Development bypass functionality
- Production security restrictions
- Error handling

Run tests with:

```bash
npm test -- src/server/auth/__tests__/requireAuth.test.ts
```

## Integration with Existing System

This authentication guard integrates with:

- **NextAuth v5**: Uses existing auth configuration from `src/auth.ts`
- **Drizzle ORM**: Compatible with existing database schema
- **Effect TS**: Leverages existing Effect TS setup in the project
- **API Standards**: Follows project API response patterns

## Requirements Satisfied

This implementation satisfies the following requirements:

- **1.4**: Authentication token validation
- **1.5**: Session management and validation
- **1.6**: Redirect unauthenticated users
- **6.1**: Development bypass with environment controls
- **6.2**: Production security restrictions
- **6.3**: Security audit logging for bypass usage
