/**
 * Re-export the shared Prisma client from @flowtiq/database.
 * This ensures a single client instance per process and uses
 * the generated types from the canonical schema in packages/database.
 */
export { prisma as default, prisma } from '@flowtiq/database';
export type { Prisma } from '@flowtiq/database';
