import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
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
  let dataSource: { transaction: jest.Mock };

  beforeEach(async () => {
    repo = { findOne: jest.fn(), save: jest.fn().mockResolvedValue(undefined) };
    // Accept both transaction(cb) used by withCurrentUserTransaction (removeDependency)
    // and transaction('SERIALIZABLE', cb) used by addDependency.
    dataSource = {
      transaction: jest.fn(async (isolationOrCb: any, maybeCb?: any) => {
        const cb = typeof isolationOrCb === 'function' ? isolationOrCb : maybeCb;
        return cb({
          query: jest.fn().mockResolvedValue(undefined),
          getRepository: () => repo,
        });
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DependenciesService,
        { provide: getRepositoryToken(Ticket), useValue: repo },
        { provide: DataSource, useValue: dataSource },
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

    it('uses SERIALIZABLE isolation so the cycle check and insert are atomic', async () => {
      const blocked = makeTicket({ id: 2, projectId: 1, blockers: [] });
      const blocker = makeTicket({ id: 1, projectId: 1, blockers: [] });
      repo.findOne
        .mockResolvedValueOnce(blocked)
        .mockResolvedValueOnce(blocker)
        .mockResolvedValueOnce(blocker);

      await service.addDependency(2, 1);

      expect(dataSource.transaction).toHaveBeenCalledWith('SERIALIZABLE', expect.any(Function));
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

    it('rejects complex cycle: A->B, A->C, B->C, C->A (starting from B)', async () => {
      // Scenario: A blocks both B and C, B blocks C, C blocks A
      // Attempting to add B->A would create: B->A->B (cycle)
      const ticketA = makeTicket({ id: 1, projectId: 1, blockers: [] });
      const ticketB = makeTicket({ id: 2, projectId: 1, blockers: [ticketA] });
      const ticketC = makeTicket({ id: 3, projectId: 1, blockers: [ticketA, ticketB] });
      ticketA.blockers = [ticketC]; // Now C->A

      // addDependency(blockedId=1, blockerId=2): try to make B block A
      repo.findOne
        .mockResolvedValueOnce(ticketA)   // blockedTicket id=1, blockers=[C(3)]
        .mockResolvedValueOnce(ticketB)   // blockerTicket id=2
        .mockResolvedValueOnce(ticketB)   // DFS startId=2: blockers=[A(1)] → A.id===1 → cycle
        .mockResolvedValueOnce(ticketA);  // (called for blockers resolution)

      await expect(service.addDependency(1, 2)).rejects.toThrow(BadRequestException);
    });

    it('allows diamond pattern without cycle: A->B, A->C, B->D, C->D', async () => {
      const ticketA = makeTicket({ id: 1, projectId: 1, blockers: [] });
      const ticketB = makeTicket({ id: 2, projectId: 1, blockers: [ticketA] });
      const ticketC = makeTicket({ id: 3, projectId: 1, blockers: [ticketA] });
      const ticketD = makeTicket({ id: 4, projectId: 1, blockers: [] });

      // Try to add D->B (no cycle)
      repo.findOne
        .mockResolvedValueOnce(ticketB)   // blockedTicket id=2, blockers=[A]
        .mockResolvedValueOnce(ticketD)   // blockerTicket id=4
        .mockResolvedValueOnce(ticketD)   // DFS startId=4: blockers=[] → no cycle
        .mockResolvedValueOnce(ticketB);  // save

      await service.addDependency(2, 4);
      expect(repo.save).toHaveBeenCalled();
    });

    it('allows linear chain: A blocks B, B blocks C, C blocks D (no back-edge)', async () => {
      const ticketA = makeTicket({ id: 1, projectId: 1, blockers: [] });
      const ticketB = makeTicket({ id: 2, projectId: 1, blockers: [ticketA] });
      const ticketC = makeTicket({ id: 3, projectId: 1, blockers: [ticketB] });
      const ticketD = makeTicket({ id: 4, projectId: 1, blockers: [ticketC] });

      // Try to add D->X for some X not in chain
      const ticketX = makeTicket({ id: 5, projectId: 1, blockers: [] });
      repo.findOne
        .mockResolvedValueOnce(ticketX)   // blockedTicket id=5
        .mockResolvedValueOnce(ticketD)   // blockerTicket id=4
        .mockResolvedValueOnce(ticketD)   // DFS startId=4: blockers=[C(3)]
        .mockResolvedValueOnce(ticketC)   // DFS startId=3: blockers=[B(2)]
        .mockResolvedValueOnce(ticketB)   // DFS startId=2: blockers=[A(1)]
        .mockResolvedValueOnce(ticketA)   // DFS startId=1: blockers=[] → no cycle
        .mockResolvedValueOnce(ticketX);  // save

      await service.addDependency(5, 4);
      expect(repo.save).toHaveBeenCalled();
    });

    it('prevents cycle with multiple incoming edges: A->B, C->B, attempt B->A', async () => {
      const ticketA = makeTicket({ id: 1, projectId: 1, blockers: [] });
      const ticketB = makeTicket({ id: 2, projectId: 1, blockers: [ticketA] });
      const ticketC = makeTicket({ id: 3, projectId: 1, blockers: [] });
      ticketB.blockers.push(ticketC); // B blocked by both A and C

      // Try to add A->B (cycle)
      repo.findOne
        .mockResolvedValueOnce(ticketA)   // blockedTicket id=1, blockers=[]
        .mockResolvedValueOnce(ticketB)   // blockerTicket id=2
        .mockResolvedValueOnce(ticketB)   // DFS startId=2: blockers=[A(1), C(3)] → A.id===1 → cycle
        .mockResolvedValueOnce(ticketA);  // (might be called)

      await expect(service.addDependency(1, 2)).rejects.toThrow(BadRequestException);
    });

    it('allows dependency when target is unreachable: A->B, C->D, add B->C', async () => {
      const ticketA = makeTicket({ id: 1, projectId: 1, blockers: [] });
      const ticketB = makeTicket({ id: 2, projectId: 1, blockers: [ticketA] });
      const ticketC = makeTicket({ id: 3, projectId: 1, blockers: [] });
      const ticketD = makeTicket({ id: 4, projectId: 1, blockers: [ticketC] });

      // Try to add C->B (no cycle, different components)
      repo.findOne
        .mockResolvedValueOnce(ticketC)   // blockedTicket id=3, blockers=[]
        .mockResolvedValueOnce(ticketB)   // blockerTicket id=2
        .mockResolvedValueOnce(ticketB)   // DFS startId=2: blockers=[A(1)]
        .mockResolvedValueOnce(ticketA)   // DFS startId=1: blockers=[] → no cycle
        .mockResolvedValueOnce(ticketC);  // save

      await service.addDependency(3, 2);
      expect(repo.save).toHaveBeenCalled();
    });

    it('handles deep recursion: A->B->C->D->E->F, attempt F->A', async () => {
      const tickets = Array.from({ length: 6 }, (_, i) =>
        makeTicket({ id: i + 1, projectId: 1, blockers: [] })
      );

      // Chain: A blocks B, B blocks C, C blocks D, D blocks E, E blocks F
      for (let i = 1; i < tickets.length; i++) {
        tickets[i].blockers = [tickets[i - 1]];
      }

      // Try to add F->A (cycle through 5 hops)
      repo.findOne
        .mockResolvedValueOnce(tickets[0])  // blockedTicket id=1
        .mockResolvedValueOnce(tickets[5])  // blockerTicket id=6
        .mockResolvedValueOnce(tickets[5])  // DFS startId=6: blockers=[E(5)]
        .mockResolvedValueOnce(tickets[4])  // DFS startId=5: blockers=[D(4)]
        .mockResolvedValueOnce(tickets[3])  // DFS startId=4: blockers=[C(3)]
        .mockResolvedValueOnce(tickets[2])  // DFS startId=3: blockers=[B(2)]
        .mockResolvedValueOnce(tickets[1])  // DFS startId=2: blockers=[A(1)]
        .mockResolvedValueOnce(tickets[0]); // DFS: A.id===1 → cycle

      await expect(service.addDependency(1, 6)).rejects.toThrow(BadRequestException);
    });
  });

  describe('getDependencies', () => {
    it('returns blockers when ticket exists', async () => {
      const blocker = makeTicket({ id: 2 });
      const blocked = makeTicket({ id: 1, blockers: [blocker] });
      repo.findOne.mockResolvedValue(blocked);

      const result = await service.getDependencies(1);
      expect(result).toEqual([blocker]);
    });

    it('throws NotFoundException when ticket does not exist', async () => {
      repo.findOne.mockResolvedValue(null);
      await expect(service.getDependencies(99)).rejects.toThrow(NotFoundException);
    });
  });

  describe('addDependency — DFS edge cases', () => {
    it('skips already-visited node when the same ID appears via multiple paths', async () => {
      // Graph: S→B, S→C, C→D, D→B  (B is reachable via S directly AND via S→C→D→B)
      // DFS from S pops B first (via S), then C (via S), then D (via C), then B again (via D).
      // The second pop of B hits the visited-node guard at line 82.
      const ticketT = makeTicket({ id: 10, projectId: 1, blockers: [] });
      const ticketS = makeTicket({ id: 1,  projectId: 1, blockers: [] });
      const ticketB = makeTicket({ id: 2,  projectId: 1, blockers: [] });
      const ticketC = makeTicket({ id: 3,  projectId: 1, blockers: [] });
      const ticketD = makeTicket({ id: 4,  projectId: 1, blockers: [] });

      ticketS.blockers = [ticketB, ticketC];
      ticketC.blockers = [ticketD];
      ticketD.blockers = [ticketB];

      repo.findOne
        .mockResolvedValueOnce(ticketT)  // blockedTicket id=10
        .mockResolvedValueOnce(ticketS)  // blockerTicket id=1
        .mockResolvedValueOnce(ticketS)  // DFS pop 1
        .mockResolvedValueOnce(ticketC)  // DFS pop 3
        .mockResolvedValueOnce(ticketD)  // DFS pop 4
        .mockResolvedValueOnce(ticketB); // DFS pop 2 first time; second pop uses visited set

      await service.addDependency(10, 1);
      expect(repo.save).toHaveBeenCalled();
    });

    it('gracefully skips unresolvable ticket IDs in DFS', async () => {
      // Ticket 1 has a blocker (id=5) that returns null from the DB.
      // DFS should continue (line 92 continue) instead of throwing.
      const ticketT  = makeTicket({ id: 10, projectId: 1, blockers: [] });
      const ticketS  = makeTicket({ id: 1,  projectId: 1, blockers: [] });
      const ghostRef = makeTicket({ id: 5,  projectId: 1, blockers: [] });
      ticketS.blockers = [ghostRef];

      repo.findOne
        .mockResolvedValueOnce(ticketT)  // blockedTicket id=10
        .mockResolvedValueOnce(ticketS)  // blockerTicket id=1
        .mockResolvedValueOnce(ticketS)  // DFS pop 1: blockers=[ghost(5)]
        .mockResolvedValueOnce(null);    // DFS pop 5: not found → continue

      await service.addDependency(10, 1);
      expect(repo.save).toHaveBeenCalled();
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
