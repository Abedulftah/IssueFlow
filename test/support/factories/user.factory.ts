import { UserRole } from '../../../src/users/user.entity';

export interface UserPayload {
  username: string;
  email: string;
  fullName: string;
  role: UserRole;
  password: string;
}

let counter = 0;

function uniqueSuffix(): string {
  counter += 1;
  return `${Date.now().toString(36)}${counter.toString(36)}`;
}

export function makeUserPayload(
  overrides: Partial<UserPayload> = {},
): UserPayload {
  const suffix = uniqueSuffix();
  const base: UserPayload = {
    username: `user_${suffix}`,
    email: `user_${suffix}@test.com`,
    fullName: 'Test User',
    role: UserRole.DEVELOPER,
    password: 'secret',
  };
  return { ...base, ...overrides };
}
