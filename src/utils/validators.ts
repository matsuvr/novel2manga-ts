import { ValidationError } from '@/utils/api-error'

export function validateJobId(value: unknown): asserts value is string {
  if (typeof value !== 'string' || value.trim() === '' || value === 'undefined') {
    throw new ValidationError('Invalid jobId', 'jobId')
  }
}
