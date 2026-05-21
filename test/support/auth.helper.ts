import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { UserRole } from '../../src/users/user.entity';
import { makeUserPayload } from './factories/user.factory';

export interface SeededUser {
  id: number;
  username: string;
  email: string;
  fullName: string;
  role: UserRole;
  password: string;
}

export interface AuthSession extends SeededUser {
  token: string;
  authHeader: { Authorization: string };
}

export async function seedUser(
  app: INestApplication,
  overrides: Partial<SeededUser> = {},
): Promise<SeededUser> {
  const payload = makeUserPayload(overrides);
  const res = await request(app.getHttpServer()).post('/users').send(payload);
  if (res.status !== 200 && res.status !== 201) {
    throw new Error(
      `seedUser failed (${res.status}): ${JSON.stringify(res.body)}`,
    );
  }
  return {
    id: res.body.id,
    username: payload.username,
    email: payload.email,
    fullName: payload.fullName,
    role: payload.role,
    password: payload.password,
  };
}

export async function login(
  app: INestApplication,
  username: string,
  password = 'secret',
): Promise<{ token: string; authHeader: { Authorization: string } }> {
  const res = await request(app.getHttpServer())
    .post('/auth/login')
    .send({ username, password });
  if (res.status !== 200 && res.status !== 201) {
    throw new Error(
      `login failed for ${username} (${res.status}): ${JSON.stringify(res.body)}`,
    );
  }
  const token: string = res.body.accessToken;
  return { token, authHeader: { Authorization: `Bearer ${token}` } };
}

export async function seedAndLogin(
  app: INestApplication,
  overrides: Partial<SeededUser> = {},
): Promise<AuthSession> {
  const user = await seedUser(app, overrides);
  const { token, authHeader } = await login(app, user.username, user.password);
  return { ...user, token, authHeader };
}
