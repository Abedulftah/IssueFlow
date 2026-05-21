export interface ProjectPayload {
  name: string;
  description: string;
  ownerId: number;
}

let counter = 0;

export function makeProjectPayload(
  ownerId: number,
  overrides: Partial<ProjectPayload> = {},
): ProjectPayload {
  counter += 1;
  return {
    name: `Project ${counter}-${Date.now().toString(36)}`,
    description: 'e2e project',
    ownerId,
    ...overrides,
  };
}
