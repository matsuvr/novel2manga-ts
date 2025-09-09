#!/usr/bin/env bun
// TypeScript file executed directly with Bun (no compilation needed)

interface User {
  id: number
  name: string
  email: string
  createdAt: Date
}

class UserService {
  private users: User[] = []

  createUser(name: string, email: string): User {
    const user: User = {
      id: this.users.length + 1,
      name,
      email,
      createdAt: new Date(),
    }
    this.users.push(user)
    return user
  }

  getUserById(id: number): User | undefined {
    return this.users.find(user => user.id === id)
  }

  getAllUsers(): User[] {
    return [...this.users]
  }

  async simulateAsyncOperation(): Promise<string> {
    return new Promise(resolve => {
      setTimeout(() => {
        resolve('Async operation completed')
      }, 100)
    })
  }
}

async function testTypeScriptDirectExecution() {
  console.log('🧪 Testing TypeScript direct execution with Bun...')

  try {
    const userService = new UserService()

    // Test class instantiation and method calls
    const user1 = userService.createUser('Alice', 'alice@example.com')
    const user2 = userService.createUser('Bob', 'bob@example.com')

    console.log('✅ TypeScript classes work:', { user1, user2 })

    // Test interface usage
    const user = userService.getUserById(1)
    if (user) {
      console.log('✅ TypeScript interfaces work:', user)
    }

    // Test async/await
    const result = await userService.simulateAsyncOperation()
    console.log('✅ TypeScript async/await works:', result)

    // Test array methods and modern JS features
    const allUsers = userService.getAllUsers()
    const filteredUsers = allUsers.filter(u => u.name.startsWith('A'))
    console.log('✅ Modern JS features work:', filteredUsers)

    console.log('🎉 TypeScript direct execution test passed!')
    return true

  } catch (error) {
    console.error('❌ Test failed:', error)
    return false
  }
}

// Run the test
testTypeScriptDirectExecution().then(success => {
  process.exit(success ? 0 : 1)
})
