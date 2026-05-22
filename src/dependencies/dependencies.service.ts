import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Ticket } from '../tickets/ticket.entity';

@Injectable()
export class DependenciesService {
  constructor(
    @InjectRepository(Ticket)
    private readonly ticketsRepository: Repository<Ticket>,
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

    const [blockedTicket, blockerTicket] = await Promise.all([
      this.ticketsRepository.findOne({ where: { id: blockedId }, relations: ['blockers'] }),
      this.ticketsRepository.findOne({ where: { id: blockerId } }),
    ]);

    if (!blockedTicket) throw new NotFoundException(`Ticket ${blockedId} not found`);
    if (!blockerTicket) throw new NotFoundException(`Ticket ${blockerId} not found`);

    if (blockedTicket.projectId !== blockerTicket.projectId) {
      throw new BadRequestException('Both tickets must belong to the same project');
    }

    if (blockedTicket.blockers.some((b) => b.id === blockerId)) {
      throw new ConflictException('This dependency already exists');
    }

    if (await this.wouldCreateCycle(blockerId, blockedId)) {
      throw new BadRequestException('Adding this dependency would create a circular dependency');
    }

    blockedTicket.blockers.push(blockerTicket);
    await this.ticketsRepository.save(blockedTicket);
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
    await this.ticketsRepository.save(ticket);
  }

  private async wouldCreateCycle(
    startId: number,
    targetId: number,
    visited = new Set<number>(),
  ): Promise<boolean> {
    if (visited.has(startId)) return false;
    visited.add(startId);

    const ticket = await this.ticketsRepository.findOne({
      where: { id: startId },
      relations: ['blockers'],
    });
    if (!ticket) return false;

    for (const blocker of ticket.blockers) {
      if (blocker.id === targetId) return true;
      if (await this.wouldCreateCycle(blocker.id, targetId, visited)) return true;
    }
    return false;
  }
}
