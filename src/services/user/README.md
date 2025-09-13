# User Service

This module provides user management functionality using Effect TS for type-safe error handling and functional programming patterns.

## Features

- **User Settings Management**: Get and update user preferences (email notifications, theme, language)
- **Account Deletion**: Safely delete user accounts with cascade deletion of related data
- **Type-Safe Error Handling**: Uses Effect TS for comprehensive error management
- **Input Validation**: Validates all user input with detailed error messages

## API Endpoints

### GET /api/me

Retrieves current user information and settings.

**Response:**

```json
{
  "data": {
    "id": "user-id",
    "email": "user@example.com",
    "name": "User Name",
    "image": "profile-image-url",
    "settings": {
      "emailNotifications": true,
      "theme": "light",
      "language": "ja"
    },
    "timestamp": "2025-01-10T22:00:00.000Z"
  }
}
```

### PATCH /api/me

Updates user settings.

**Request Body:**

```json
{
  "settings": {
    "emailNotifications": false,
    "theme": "dark",
    "language": "en"
  }
}
```

**Response:**

```json
{
  "data": {
    "success": true,
    "message": "設定が更新されました",
    "timestamp": "2025-01-10T22:00:00.000Z"
  }
}
```

### DELETE /api/me

Deletes the user account (requires confirmation).

**Request Body:**

```json
{
  "confirm": true
}
```

**Response:**

```json
{
  "data": {
    "success": true,
    "message": "アカウントが削除されました",
    "timestamp": "2025-01-10T22:00:00.000Z"
  }
}
```

## Error Handling

The service uses Effect TS for comprehensive error handling:

- **ValidationError**: Invalid input data (400)
- **UserNotFoundError**: User does not exist (404)
- **DatabaseError**: Database operation failed (500)
- **AuthenticationError**: User not authenticated (401)

## Usage Example

```typescript
import { Effect } from 'effect'
import { UserService, UserServiceLive } from '@/services/user'

const program = Effect.gen(function* () {
  const userService = yield* UserService

  // Get user settings
  const settings = yield* userService.getSettings('user-id')

  // Update settings
  yield* userService.updateSettings('user-id', {
    theme: 'dark',
    emailNotifications: false,
  })
})

// Run the program
Effect.runPromise(program.pipe(Effect.provide(UserServiceLive)))
```

## Requirements Satisfied

This implementation satisfies the following requirements from the specification:

- **2.1**: User settings management (email notifications, theme, language)
- **2.2**: Settings persistence and retrieval
- **2.3**: Input validation and error handling
- **2.4**: Account deletion functionality
- **2.5**: User preference updates
- **2.6**: Confirmation requirements for destructive operations
