## 1. Database Entity & Schema

- [x] 1.1 Create `src/projects/project.entity.ts` — define `Project` entity with `@Entity()`, columns: `id` (PK auto-increment), `name` (varchar, not null), `description` (text, not null), `ownerId` (int, not null); add `@ManyToOne(() => User, { eager: false })` relation on `ownerId`
- [x] 1.2 Verify TypeORM `synchronize: true` is set in `AppModule` / data-source config so the `projects` table is auto-created on next app start

## 2. Data Transfer Objects (DTOs)

- [x] 2.1 Create `src/projects/dto/create-project.dto.ts` — fields: `name: string` (IsString, IsNotEmpty), `description: string` (IsString, IsNotEmpty), `ownerId: number` (IsInt, IsPositive)
- [x] 2.2 Create `src/projects/dto/update-project.dto.ts` — fields: optional `name?: string`, optional `description?: string` (both IsString, IsOptional); `ownerId` excluded

## 3. Core Service Logic

- [x] 3.1 Create `src/projects/projects.service.ts` — inject `Repository<Project>` and `UsersService`; implement `create(dto)`: call `usersService.findOne(dto.ownerId)`, throw `NotFoundException` if not found, save and return project
- [x] 3.2 Implement `findAll()` — `repository.find()`; return array
- [x] 3.3 Implement `findOne(id)` — `repository.findOne({ where: { id } })`; throw `NotFoundException` if not found
- [x] 3.4 Implement `update(id, dto)` — call `findOne(id)` (throws 404 if missing), apply partial update of `name`/`description`, save and return updated entity
- [x] 3.5 Implement `remove(id)` — call `findOne(id)` (throws 404 if missing), call `repository.delete(id)`, return 200

## 4. REST Controller Routing

- [x] 4.1 Create `src/projects/projects.controller.ts` — apply `@UseGuards(JwtAuthGuard)` at controller level; define routes:
  - `GET /projects`
  - `GET /projects/:projectId`
  - `POST /projects`
  - `PATCH /projects/:projectId`
  - `DELETE /projects/:projectId`
- [x] 4.2 Parse `:projectId` with `ParseIntPipe` on all parameterised routes; apply `ValidationPipe` for body DTOs

## 5. Module Wiring & Auth Guarantees

- [x] 5.1 Create `src/projects/projects.module.ts` — import `TypeOrmModule.forFeature([Project])`; import `UsersModule` to inject `UsersService` for owner validation; export `ProjectsService` for future downstream modules
- [x] 5.2 Register `ProjectsModule` in `src/app.module.ts` imports array

## 6. Unit Tests

- [x] 6.1 Create `src/projects/projects.service.spec.ts` — test `create`: owner not found → 404; successful create → returns entity
- [x] 6.2 Test `findAll` and `findOne`: non-existent id → 404
- [x] 6.3 Test `update`: project not found → 404; partial field update preserves unchanged fields
- [x] 6.4 Test `remove`: project not found → 404; successful delete → entity removed
