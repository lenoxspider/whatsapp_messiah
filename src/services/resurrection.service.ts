import { getDatabase } from '../db/client.js';

export interface DormantContact {
  jid: string;
  phone: string;
  name: string | null;
  tier: number;
  lastInteraction: number;
  daysDormant: number;
  formattedLastSpoke: string;
}

export class ResurrectionService {
  findDormantThreads(minDays: number = 14, maxTier: number = 2): DormantContact[] {
    const db = getDatabase();
    const cutoffTimestamp = Date.now() - (minDays * 24 * 60 * 60 * 1000);

    const rows = db.prepare(`
      SELECT jid, phone, name, tier, last_interaction
      FROM contacts
      WHERE tier <= ?
        AND last_interaction IS NOT NULL
        AND last_interaction < ?
      ORDER BY tier ASC, last_interaction ASC
      LIMIT 25
    `).all(maxTier, cutoffTimestamp) as Array<{
      jid: string;
      phone: string;
      name: string | null;
      tier: number;
      last_interaction: number;
    }>;

    return rows.map(r => {
      const daysDormant = Math.floor((Date.now() - r.last_interaction) / (1000 * 60 * 60 * 24));
      return {
        jid: r.jid,
        phone: r.phone,
        name: r.name,
        tier: r.tier,
        lastInteraction: r.last_interaction,
        daysDormant,
        formattedLastSpoke: new Date(r.last_interaction).toLocaleDateString([], {
          month: 'short',
          day: 'numeric',
          year: 'numeric'
        })
      };
    });
  }

  formatDormantReport(threads: DormantContact[], minDays: number = 14): string {
    if (threads.length === 0) {
      return `✨ *No Dormant Connections Found!*\nAll your Tier 1 (VIP) and Tier 2 (Friends) contacts have been in contact within the last ${minDays} days.`;
    }

    let report = `❄️ *DORMANT THREADS RADAR*\n`;
    report += `Surfacing *${threads.length}* high-value connections going cold (> ${minDays} days silent):\n\n`;

    const tierBadges: Record<number, string> = {
      1: '🟢 Tier 1 VIP',
      2: '🔵 Tier 2 Friend'
    };

    threads.forEach((c, idx) => {
      const displayName = c.name ? `${c.name} (+${c.phone})` : `+${c.phone}`;
      report += `*${idx + 1}.* *${displayName}* &middot; ${tierBadges[c.tier] || 'Tier ' + c.tier}\n`;
      report += `   _Silent for ${c.daysDormant} days (Last active: ${c.formattedLastSpoke})_\n\n`;
    });

    report += `💡 _Tip: Reach out to restart the thread or check in on open projects._`;

    return report.trim();
  }
}

export const resurrectionService = new ResurrectionService();
