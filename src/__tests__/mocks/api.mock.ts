// Local API mock (migrated from src/test/mocks/api.mock.ts)
import { ApiError, effectToApiResponse } from './effectToApiResponse.mock'

export const apiMock = {
  get: () => Promise.resolve({ status: 200 }),
}

export { ApiError, effectToApiResponse }
