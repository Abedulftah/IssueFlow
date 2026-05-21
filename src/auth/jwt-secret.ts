export function resolveJwtSecret(): string {
  const secret = process.env.JWT_SECRET?.trim();
  if (secret) return secret;

  if (process.env.NODE_ENV === 'test') {
    return 'issueflow-test-secret';
  }

  throw new Error('JWT_SECRET environment variable must be set');
}