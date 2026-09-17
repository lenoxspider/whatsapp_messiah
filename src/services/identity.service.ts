import type { WASocket, GroupMetadata } from '@whiskeysockets/baileys';
import { contactRepo } from '../db/repositories/contact.repo.js';
import { messageRepo } from '../db/repositories/message.repo.js';

export interface SharedGroupInfo {
  id: string;
  subject: string;
  memberCount: number;
  isAdmin: boolean;
}

export interface IdentityProfile {
  jid: string;
  phone: string;
  pushName?: string | null;
  savedName?: string | null;
  tier: number;
  totalMessages: number;
  firstSeen: number | null;
  lastSeen: number | null;
  sharedGroups: SharedGroupInfo[];
}

export class IdentityService {
  private groupCache: Record<string, GroupMetadata> | null = null;
  private lastGroupFetch: number = 0;
  private readonly CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

  async getParticipatingGroups(sock: WASocket): Promise<Record<string, GroupMetadata>> {
    const now = Date.now();
    if (this.groupCache && (now - this.lastGroupFetch < this.CACHE_TTL_MS)) {
      return this.groupCache;
    }

    try {
      const groups = await sock.groupFetchAllParticipating();
      this.groupCache = groups;
      this.lastGroupFetch = now;
      return groups;
    } catch (err: any) {
      console.warn(`[IdentityService] Failed to fetch participating groups: ${err.message}`);
      return this.groupCache || {};
    }
  }

  invalidateGroupCache(): void {
    this.groupCache = null;
    this.lastGroupFetch = 0;
  }

  async resolveIdentity(sock: WASocket, targetJid: string, incomingPushName?: string): Promise<IdentityProfile> {
    const cleanPhone = targetJid.split('@')[0].replace(/[^0-9]/g, '');
    const standardJid = targetJid.includes('@') ? targetJid : `${cleanPhone}@s.whatsapp.net`;

    const contact = contactRepo.getContact(standardJid);
    const stats = messageRepo.getMessageStats(standardJid);

    // Discover shared groups via Baileys socket
    const groups = await this.getParticipatingGroups(sock);
    const sharedGroups: SharedGroupInfo[] = [];

    for (const [groupId, group] of Object.entries(groups)) {
      if (!group.participants) continue;

      const participant = group.participants.find(p => {
        const pPhone = p.id.split('@')[0].replace(/[^0-9]/g, '');
        return p.id === standardJid || pPhone === cleanPhone || p.id === targetJid;
      });

      if (participant) {
        sharedGroups.push({
          id: groupId,
          subject: group.subject || 'Unnamed Group',
          memberCount: group.participants.length,
          isAdmin: participant.admin === 'admin' || participant.admin === 'superadmin'
        });
      }
    }

    return {
      jid: standardJid,
      phone: cleanPhone,
      pushName: incomingPushName || null,
      savedName: contact?.name || null,
      tier: contact?.tier ?? 4,
      totalMessages: stats.totalCount,
      firstSeen: stats.firstSeen,
      lastSeen: stats.lastSeen,
      sharedGroups
    };
  }

  formatIdentityCard(profile: IdentityProfile): string {
    const displayName = profile.savedName || profile.pushName || 'Unknown Contact';
    const tierLabels: Record<number, string> = {
      1: '🟢 Tier 1 (VIP)',
      2: '🔵 Tier 2 (Friend / Acquaintance)',
      3: '🟣 Tier 3 (Work / Business)',
      4: '🟡 Tier 4 (Stranger)',
      5: '🔴 Tier 5 (Ghost / Mute)'
    };

    let card = `🔍 *IDENTITY RESOLVED: ${displayName}*\n`;
    card += `📞 Phone: +${profile.phone}\n`;
    card += `🏷️ Classification: ${tierLabels[profile.tier] || 'Tier ' + profile.tier}\n`;

    if (profile.firstSeen) {
      const firstSeenDate = new Date(profile.firstSeen).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
      card += `🕒 History: First seen ${firstSeenDate} &middot; ${profile.totalMessages} messages recorded\n`;
    } else {
      card += `🕒 History: First-time interaction (0 prior messages)\n`;
    }

    if (profile.sharedGroups.length > 0) {
      card += `\n👥 *Shared Groups (${profile.sharedGroups.length})*:\n`;
      for (const g of profile.sharedGroups.slice(0, 5)) {
        card += `  • *${g.subject}* (${g.memberCount} members${g.isAdmin ? ' &middot; Admin' : ''})\n`;
      }
      if (profile.sharedGroups.length > 5) {
        card += `  • _...and ${profile.sharedGroups.length - 5} more groups_\n`;
      }
    } else {
      card += `\n👥 *Shared Groups*: None detected\n`;
    }

    return card.trim();
  }
}

export const identityService = new IdentityService();
