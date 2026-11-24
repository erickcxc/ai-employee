// How long each kind of data is kept (SOC 2 C1.2, P4.2). One place to read it, one job enforces it
// (src/jobs runRetention). The audit log is never pruned by this job: it is the record of what happened.
export const RETENTION = {
  /** Call transcripts are the most personal data: cleared after this many days; the call record stays. */
  transcriptDays: 90,
  /** Used or expired sign-in links are removed after this many days. */
  loginLinkDays: 1,
  /** Ended or expired sessions are removed after this many days. */
  sessionDays: 30,
} as const;
