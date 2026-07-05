import prisma from './prisma';

// A project is visible to a non-privileged user only if they are the owner,
// a team/follow-up/reporting owner, or assigned to one of its stages/sub-tasks.
export function projectAccessOR(userId: string) {
  return [
    { ownerId: userId },
    { teamMembers: { has: userId } },
    { followUpOwnerId: userId },
    { reportingOwnerId: userId },
    { stages: { some: { OR: [{ assignedTo: userId }, { assignedToIds: { has: userId } }] } } },
    { stages: { some: { subTasks: { some: { assignedTo: userId } } } } },
  ];
}

export async function getAccessibleProjectIds(tenantId: string, userId: string): Promise<Set<string>> {
  const projects = await prisma.project.findMany({
    where: { tenantId, OR: projectAccessOR(userId) },
    select: { id: true },
  });
  return new Set(projects.map((p) => p.id));
}
