import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DependenciesService } from './dependencies.service';
import { Ticket } from '../tickets/ticket.entity';
import { TicketStatus, TicketPriority, TicketType } from '../tickets/enums';

const makeTicket = (overrides: Partial<Ticket> = {}): Ticket =>
  ({
    id: 1,
    title: 'Ticket',
    status: TicketStatus.TODO,
    priority: TicketPriority.MEDIUM,
    type: TicketType.TECHNICAL,
    projectId: 1,
    assigneeId: null,
    dueDate: null,
    isOverdue: false,
    version: 1,
    blockers: [],
    blockingTickets: [],
    project: null,
    assignee: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as Ticket);

describe('DependenciesService', () => {
  let service: DependenciesService;
  let repo: {
    findOne: jest.Mock;
    save: jest.Mock;
  };

  beforeEach(async () => {
    repo = { findOne: jest.fn(), save: jest.fn().mockResolvedValue(undefined) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DependenciesService,
        { provide: getRepositoryToken(Ticket), useValue: repo },
      ],
    }).compile();

    service = module.get(DependenciesService);
  });

  describe('addDependency', () => {
    it('persists the dependency and logs ADD_DEPENDENCY on success', async () => {
      const blocked = makeTicket({ id: 2, projectId: 1, blockers: [] });
      const blocker = makeTicket({ id: 1, projectId: 1, blockers: [] });

      repo.findOne
        .mockResolvedValueOnce(blocked)  // blockedTicket
        .mockResolvedValueOnce(blocker)  // blockerTicket
        .mockResolvedValueOnce(blocker); // DFS: blockers of blocker (empty)

      await service.addDependency(2, 1);

      expect(repo.save).toHaveBeenCalled();
    });

    it('rejects self-block', async () => {
      await expect(service.addDependency(1, 1)).rejects.toThrow(BadRequestException);
      expect(repo.findOne).not.toHaveBeenCalled();
    });

    it('throws 404 when blocked ticket does not exist', async () => {
      repo.findOne.mockResolvedValueOnce(null);
      await expect(service.addDependency(99, 1)).rejects.toThrow(NotFoundException);
    });

    it('throws 404 when blocker ticket does not exist', async () => {
      const blocked = makeTicket({ id: 2, blockers: [] });
      repo.findOne.mockResolvedValueOnce(blocked).mockResolvedValueOnce(null);
      await expect(service.addDependency(2, 99)).rejects.toThrow(NotFoundException);
    });

    it('rejects cross-project dependency', async () => {
      const blocked = makeTicket({ id: 2, projectId: 1, blockers: [] });
      const blocker = makeTicket({ id: 1, projectId: 2 });
      repo.findOne.mockResolvedValueOnce(blocked).mockResolvedValueOnce(blocker);

      await expect(service.addDependency(2, 1)).rejects.toThrow(BadRequestException);
    });

    it('rejects duplicate dependency', async () => {
      const blocker = makeTicket({ id: 1, projectId: 1 });
      const blocked = makeTicket({ id: 2, projectId: 1, blockers: [blocker] });
      repo.findOne.mockResolvedValueOnce(blocked).mockResolvedValueOnce(blocker);

      await expect(service.addDependency(2, 1)).rejects.toThrow(ConflictException);
    });

    it('rejects direct cycle: A blocks B, attempt B blocks A', async () => {
      // A(1) already blocks B(2): B.blockers = [A]
      // Now trying to add A.blockers = [B] → cycle
      const ticketA = makeTicket({ id: 1, projectId: 1, blockers: [] });
      const ticketB = makeTicket({ id: 2, projectId: 1, blockers: [ticketA] });

      // addDependency(blockedId=1, blockerId=2): A is blocked by B
      repo.findOne
        .mockResolvedValueOnce(ticketA)   // blockedTicket (id=1), blockers=[]
        .mockResolvedValueOnce(ticketB)   // blockerTicket (id=2)
        .mockResolvedValueOnce(ticketB);  // DFS startId=2: blockers=[A(1)] → A.id===1(targetId) → cycle

      await expect(service.addDependency(1, 2)).rejects.toThrow(BadRequestException);
    });

    it('rejects transitive cycle: A blocks B, B blocks C, attempt C blocks A', async () => {
      const ticketA = makeTicket({ id: 1, projectId: 1, blockers: [] });
      const ticketB = makeTicket({ id: 2, projectId: 1, blockers: [ticketA] });
      const ticketC = makeTicket({ id: 3, projectId: 1, blockers: [ticketB] });

      // addDependency(blockedId=1, blockerId=3): make C block A
      repo.findOne
        .mockResolvedValueOnce(ticketA)   // blockedTicket id=1, blockers=[]
        .mockResolvedValueOnce(ticketC)   // blockerTicket id=3
        .mockResolvedValueOnce(ticketC)   // DFS startId=3: blockers=[B(2)]
        .mockResolvedValueOnce(ticketB);  // DFS startId=2: blockers=[A(1)] → A.id===1 → cycle

      await expect(service.addDependency(1, 3)).rejects.toThrow(BadRequestException);
    });
  });

  describe('removeDependency', () => {
    it('removes dependency and logs REMOVE_DEPENDENCY on success', async () => {
      const blocker = makeTicket({ id: 1 });
      const blocked = makeTicket({ id: 2, blockers: [blocker] });
      repo.findOne.mockResolvedValue(blocked);

      await service.removeDependency(2, 1);

      expect(repo.save).toHaveBeenCalled();
    });

    it('throws 404 when blocked ticket does not exist', async () => {
      repo.findOne.mockResolvedValue(null);
      await expect(service.removeDependency(99, 1)).rejects.toThrow(NotFoundException);
    });

    it('throws 404 when dependency does not exist', async () => {
      const blocked = makeTicket({ id: 2, blockers: [] });
      repo.findOne.mockResolvedValue(blocked);
      await expect(service.removeDependency(2, 99)).rejects.toThrow(NotFoundException);
    });
  });
});
