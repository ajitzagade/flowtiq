import cron from 'node-cron';
import prisma from '../lib/prisma';
import { sendPushNotification } from '../lib/push';

async function runFollowUpReminders(): Promise<void> {
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);

  try {
    // Due today
    const dueToday = await prisma.followUp.findMany({
      where: {
        nextFollowUp: { gte: today, lt: tomorrow },
        status: { not: 'completed' },
      },
      include: {
        owner: { select: { id: true, tenantId: true } },
        project: { select: { name: true } },
      },
    });

    for (const followUp of dueToday) {
      if (!followUp.owner.tenantId) {
        console.warn(`Push: skipping follow-up ${followUp.id} — owner has no tenantId (super admin?)`);
        continue;
      }
      await prisma.notification.create({
        data: {
          tenantId: followUp.owner.tenantId,
          userId: followUp.ownerId,
          type: 'reminder',
          title: 'Follow-up Due Today',
          message: `Follow-up for ${followUp.project.name} is due today`,
          data: { followUpId: followUp.id },
        },
      });
      sendPushNotification(followUp.ownerId, followUp.owner.tenantId, {
        title: 'Follow-up Due Today',
        body: `Follow-up for ${followUp.project.name} is due today`,
        eventType: 'followup_due_today',
        entityType: 'followup',
        entityId: followUp.id,
        deepLinkUrl: '/follow-ups',
      }, 'followUpReminders');
    }

    // Overdue (past due by 1+ days)
    const overdue = await prisma.followUp.findMany({
      where: {
        nextFollowUp: { lt: today },
        status: { not: 'completed' },
      },
      include: {
        owner: { select: { id: true, tenantId: true } },
        project: { select: { name: true } },
      },
    });

    for (const followUp of overdue) {
      if (!followUp.owner.tenantId) {
        console.warn(`Push: skipping follow-up ${followUp.id} — owner has no tenantId (super admin?)`);
        continue;
      }
      await prisma.notification.create({
        data: {
          tenantId: followUp.owner.tenantId,
          userId: followUp.ownerId,
          type: 'reminder',
          title: 'Follow-up Overdue',
          message: `Follow-up for ${followUp.project.name} is overdue`,
          data: { followUpId: followUp.id },
        },
      });
      sendPushNotification(followUp.ownerId, followUp.owner.tenantId, {
        title: 'Follow-up Overdue',
        body: `Follow-up for ${followUp.project.name} is overdue`,
        eventType: 'followup_overdue',
        entityType: 'followup',
        entityId: followUp.id,
        deepLinkUrl: '/follow-ups',
      }, 'followUpReminders');
    }
  } catch (error) {
    console.error('Follow-up reminders job error:', error);
  }
}

export function startFollowUpReminderJob(): void {
  // Guard: only run cron on the designated leader instance to prevent duplicate
  // notifications when multiple API instances are deployed (set CRON_LEADER=true
  // on exactly one Railway/container instance).
  if (process.env.CRON_LEADER !== 'true') {
    console.log('Follow-up reminder cron: CRON_LEADER not set — skipping registration on this instance');
    return;
  }
  // Run daily at 08:00 UTC
  cron.schedule('0 8 * * *', () => {
    runFollowUpReminders().catch((err) => console.error('Follow-up reminders job error:', err));
  });
  console.log('Follow-up reminder cron registered (leader instance)');
}
