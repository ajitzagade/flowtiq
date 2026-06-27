import 'dotenv/config';
import { app } from './app';
import { startFollowUpReminderJob } from './jobs/followup-reminders';
import { startBackupJob } from './jobs/backup';

const PORT = process.env.PORT || 3001;

app.listen(PORT, () => {
  console.log(`Flowtiq API running on http://localhost:${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
  startFollowUpReminderJob();
  startBackupJob();
});
