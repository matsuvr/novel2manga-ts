# API Security and Validation

This directory contains comprehensive security utilities for API endpoints, including input validation, rate limiting, and security measures.

## Components

### 1. Input Validation (`api-validation.ts`)

Provides comprehensive input validation and security measures:

- **Request Size Validation**: Prevents oversized requests that could cause DoS
- **JSON Parsing**: Safe JSON parsing with size limits and error handling
- **Data Validation**: Schema-based validation with type checking
- **String Sanitization**: XSS prevention through input sanitization
- **File Path Validation**: Prevents path traversal attacks
- **Security Logging**: Comprehensive logging of security violations

#### Usage Example

```typescript
import { validateData, parseJsonBody, VALIDATION_SCHEMAS } from '@/lib/api-validation'

// Validate user settings
const settings = await parseJsonBody(request)
validateData(settings, VALIDATION_SCHEMAS.USER_SETTINGS)
```

### 2. Rate Limiting (`rate-limiting.ts`)

In-memory rate limiting system with configurable limits:

- **Configurable Limits**: Different limits for different endpoint types
- **Client Identification**: IP-based client identification
- **Automatic Cleanup**: Expired entries are automatically cleaned up
- **Status Tracking**: Get remaining requests and reset times

#### Usage Example

```typescript
import { applyRateLimit, RATE_LIMITS } from '@/lib/rate-limiting'

// Apply rate limiting
applyRateLimit(request, RATE_LIMITS.AUTH)
```

### 3. Security Middleware (`api-security.ts`)

Comprehensive security middleware that combines all security measures:

- **Rate Limiting**: Automatic rate limiting based on configuration
- **Input Validation**: Request body and query parameter validation
- **Security Headers**: Automatic addition of security headers
- **Error Handling**: Consistent error responses with security headers
- **Effect TS Integration**: Compatible with Effect TS workflows

#### Usage Example

```typescript
import { withSecurity, SECURITY_CONFIGS } from '@/lib/api-security'

export const POST = withSecurity(SECURITY_CONFIGS.authenticated)(async (request, validatedData) => {
  // Your handler logic here
  return NextResponse.json({ success: true })
})
```

## Security Configurations

### Predefined Configurations

- **`SECURITY_CONFIGS.public`**: For public endpoints (100 req/15min)
- **`SECURITY_CONFIGS.authenticated`**: For authenticated endpoints (60 req/15min)
- **`SECURITY_CONFIGS.sensitive`**: For sensitive operations (10 req/15min)
- **`SECURITY_CONFIGS.upload`**: For file upload endpoints (20 req/hour)

### Custom Configuration

```typescript
const customConfig = {
  rateLimit: { requests: 50, windowMs: 15 * 60 * 1000 },
  maxBodySize: 1024 * 1024, // 1MB
  validation: {
    body: {
      name: { type: 'string', required: true, minLength: 3 },
    },
  },
}
```

## Validation Schemas

### Built-in Schemas

- **`USER_SETTINGS`**: Email notifications, theme, language preferences
- **`JOB_QUERY`**: Pagination and filtering parameters
- **`ACCOUNT_DELETION`**: Account deletion confirmation

### Custom Schema Example

```typescript
const customSchema = {
  email: {
    type: 'string',
    required: true,
    pattern: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
  },
  age: {
    type: 'number',
    min: 0,
    max: 120,
  },
  role: {
    type: 'string',
    enum: ['user', 'admin', 'moderator'],
  },
}
```

## Security Headers

The following security headers are automatically added to all responses:

- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: DENY`
- `X-XSS-Protection: 1; mode=block`
- `Referrer-Policy: strict-origin-when-cross-origin`
- `Content-Security-Policy: default-src 'self'`

## Rate Limit Headers

When rate limiting is applied, the following headers are added:

- `X-RateLimit-Limit`: Maximum number of requests allowed
- `X-RateLimit-Remaining`: Number of requests remaining in current window
- `X-RateLimit-Reset`: ISO timestamp when the rate limit resets

## Error Responses

All security violations return consistent error responses:

```json
{
  "error": {
    "code": "RATE_LIMIT_EXCEEDED",
    "message": "レート制限に達しました。2025/9/10 23:15:00 以降に再試行してください",
    "details": {
      "limit": 100,
      "remaining": 0,
      "resetTime": "2025-09-10T14:15:00.000Z"
    }
  }
}
```

## Security Violation Logging

All security violations are logged with the following information:

- Violation type (OVERSIZED_REQUEST, RATE_LIMIT_EXCEEDED, etc.)
- Timestamp
- Client IP address
- User agent
- Request URL and method
- Additional details specific to the violation

## Integration with Effect TS

The security system is fully compatible with Effect TS:

```typescript
import { withSecurityEffect } from '@/lib/api-security'

export const GET = withSecurityEffect(SECURITY_CONFIGS.authenticated, (request: NextRequest) =>
  Effect.gen(function* () {
    const user = yield* requireAuth
    // Your Effect TS logic here
    return { data: user }
  }),
)
```

## Testing

Comprehensive tests are provided in `__tests__/api-security-simple.test.ts`:

- Request size validation
- String sanitization
- File path validation
- Rate limiting behavior
- Security header addition

## Production Considerations

### Rate Limiting

In production, consider replacing the in-memory rate limiting with Redis or a similar distributed cache for multi-instance deployments.

### Security Monitoring

The current implementation logs security violations to the console. In production, integrate with a security monitoring service:

```typescript
// TODO: Replace console.warn with actual security monitoring
await sendToSecurityMonitoring(violation)
```

### Performance

- Rate limiting cleanup runs every 5 minutes
- Validation schemas are optimized for performance
- Security headers are cached where possible

## Requirements Compliance

This implementation satisfies the following requirements:

- **9.1**: Authentication token validation (integrated with existing auth system)
- **9.2**: Input validation with appropriate error messages
- **9.3**: Request size limits with 413 error responses
- **9.4**: Rate limiting implementation
- **9.5**: Security violation logging and incident tracking
