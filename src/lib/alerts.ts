import { logger } from './logger';

export interface AlertPayload {
  title: string;
  message: string;
  severity: 'critical' | 'warning' | 'info';
  metadata?: Record<string, unknown>;
}

class AlertManager {
  private errorCountWindow: number[] = [];
  private readonly ERROR_THRESHOLD_PER_MIN = 5;
  private slackWebhookUrl = process.env.SLACK_WEBHOOK_URL;
  private alertEmail = process.env.ALERT_EMAIL;

  /**
   * Track 500 errors and trigger alert if > 5 per minute
   */
  public trackServerError(error: Error | string, route?: string) {
    const now = Date.now();
    this.errorCountWindow.push(now);

    // Keep only errors from the last 60 seconds
    this.errorCountWindow = this.errorCountWindow.filter((timestamp) => now - timestamp <= 60000);

    if (this.errorCountWindow.length >= this.ERROR_THRESHOLD_PER_MIN) {
      this.sendAlert({
        title: '🚨 CRITICAL ALERT: High Error Rate (>5 errors/min)',
        message: `Detected ${this.errorCountWindow.length} 500-level errors in the last 60 seconds on route ${route || 'unknown'}. Latest: ${error}`,
        severity: 'critical',
        metadata: { route, recentErrorCount: this.errorCountWindow.length },
      });
      // Reset window to prevent duplicate spamming
      this.errorCountWindow = [];
    }
  }

  /**
   * Track Slow Requests (p95 > 5s)
   */
  public trackSlowRequest(durationMs: number, route: string) {
    if (durationMs > 5000) {
      this.sendAlert({
        title: '⚠️ WARNING: High Request Latency (>5s)',
        message: `Request to ${route} took ${(durationMs / 1000).toFixed(2)} seconds.`,
        severity: 'warning',
        metadata: { durationMs, route },
      });
    }
  }

  /**
   * Monitor CPU and DB pool saturation
   */
  public checkSystemHealth(metrics: { cpuPercent: number; activeDbConnections: number; maxDbConnections: number }) {
    if (metrics.cpuPercent > 80) {
      this.sendAlert({
        title: '🚨 CRITICAL ALERT: High CPU Utilization (>80%)',
        message: `CPU usage has reached ${metrics.cpuPercent.toFixed(1)}%.`,
        severity: 'critical',
        metadata: metrics,
      });
    }

    if (metrics.maxDbConnections > 0 && metrics.activeDbConnections / metrics.maxDbConnections > 0.85) {
      this.sendAlert({
        title: '🚨 CRITICAL ALERT: Database Connection Pool Saturated (>85%)',
        message: `Active DB connections: ${metrics.activeDbConnections} / ${metrics.maxDbConnections}`,
        severity: 'critical',
        metadata: metrics,
      });
    }
  }

  /**
   * Send notification to Slack and/or Email
   */
  public async sendAlert(payload: AlertPayload) {
    logger.error({
      message: `[ALERT TRIGGERED] [${payload.severity.toUpperCase()}] ${payload.title}`,
      alert: payload,
    });

    if (this.slackWebhookUrl) {
      try {
        await fetch(this.slackWebhookUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            text: `*${payload.title}*\n${payload.message}\n\`\`\`${JSON.stringify(payload.metadata || {}, null, 2)}\`\`\``,
          }),
        });
      } catch (err) {
        logger.error({ message: 'Failed to dispatch Slack alert', error: String(err) });
      }
    }

    if (this.alertEmail) {
      // In production, integrate email service (e.g. Resend, SendGrid, Nodemailer)
      logger.info({ message: `[SIMULATED EMAIL ALERT SENT] To: ${this.alertEmail} Subject: ${payload.title}` });
    }
  }
}

export const alertManager = new AlertManager();
