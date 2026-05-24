import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { InjectDataSource } from '@nestjs/typeorm';
import { Ticket } from '../tickets/ticket.entity';
import { getCurrentUserId } from '../database/current-user-store';
import { withCurrentUserTransaction } from '../database/current-user-transaction';

@Injectable()
export class DependenciesService {
  constructor(
    @InjectRepository(Ticket)
    private readonly ticketsRepository: Repository<Ticket>,
    @InjectDataSource() private readonly dataSource: DataSource,
  ) {}

  async getDependencies(blockedId: number): Promise<Ticket[]> {
    const ticket = await this.ticketsRepository.findOne({
      where: { id: blockedId },
      relations: ['blockers'],
    });
    if (!ticket) throw new NotFoundException(`Ticket ${blockedId} not found`);
    return ticket.blockers;
  }

  async addDependency(blockedId: number, blockerId: number): Promise<void> {
    if (blockedId === blockerId) {
      throw new BadRequestException('A ticket cannot block itself');
    }

    // SERIALIZABLE isolation ensures the cycle check and insert are atomic — concurrent
    // requests cannot both pass the cycle check and then both commit, creating a cycle.
    await this.dataSource.transaction('SERIALIZABLE', async (manager) => {
      const userId = getCurrentUserId();
      if (userId !== undefined) {
        await manager.query('SELECT set_config($1, $2, true)', [
          'issueflow.current_user_id',
          String(Number(userId)),
        ]);
      }

      const [blockedTicket, blockerTicket] = await Promise.all([
        manager.getRepository(Ticket).findOne({ where: { id: blockedId }, relations: ['blockers'] }),
        manager.getRepository(Ticket).findOne({ where: { id: blockerId } }),
      ]);

      if (!blockedTicket) throw new NotFoundException(`Ticket ${blockedId} not found`);
      if (!blockerTicket) throw new NotFoundException(`Ticket ${blockerId} not found`);

      if (blockedTicket.projectId !== blockerTicket.projectId) {
        throw new BadRequestException('Both tickets must belong to the same project');
      }

      if (blockedTicket.blockers.some((b) => b.id === blockerId)) {
        throw new ConflictException('This dependency already exists');
      }

      if (await this.wouldCreateCycle(blockerId, blockedId, manager)) {
        throw new BadRequestException('Adding this dependency would create a circular dependency');
      }

      blockedTicket.blockers.push(blockerTicket);
      await manager.getRepository(Ticket).save(blockedTicket);
    });
  }

  async removeDependency(blockedId: number, blockerId: number): Promise<void> {
    const ticket = await this.ticketsRepository.findOne({
      where: { id: blockedId },
      relations: ['blockers'],
    });
    if (!ticket) throw new NotFoundException(`Ticket ${blockedId} not found`);

    const idx = ticket.blockers.findIndex((b) => b.id === blockerId);
    if (idx === -1) throw new NotFoundException('Dependency not found');

    ticket.blockers.splice(idx, 1);
    await withCurrentUserTransaction(this.dataSource, async (manager) => {
      await manager.getRepository(Ticket).save(ticket);
    });
  }

  private async wouldCreateCycle(
    startId: number,
    targetId: number,
    manager?: EntityManager,
  ): Promise<boolean> {
    const repo = manager
      ? manager.getRepository(Ticket)
      : this.ticketsRepository;

    const stack: number[] = [startId];
    const visited = new Set<number>();

    while (stack.length > 0) {
      const currentId = stack.pop()!;
      if (visited.has(currentId)) continue;
      visited.add(currentId);

      const ticket = await repo.findOne({
        where: { id: currentId },
        relations: ['blockers'],
      });

      if (!ticket?.blockers) continue;

      for (const blocker of ticket.blockers) {
        if (blocker.id === targetId) return true;
        if (!visited.has(blocker.id)) stack.push(blocker.id);
      }
    }

    return false;
  }
}