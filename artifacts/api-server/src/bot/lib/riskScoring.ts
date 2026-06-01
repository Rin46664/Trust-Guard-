import type { GuildMember } from "discord.js";
import { logger } from "../../lib/logger";

export type RiskTier = 1 | 2 | 3 | 4 | 5 | 6;

export interface RiskAssessment {
  score: number; // 0-100, higher = more risky
  tier: RiskTier;
  signals: string[];
  accountAgeDays: number;
  hasAvatar: boolean;
  hasBanner: boolean;
}

const MS_PER_DAY = 1000 * 60 * 60 * 24;

function getAccountAgeDays(userId: string): number {
  // Discord snowflake: first 42 bits are ms since Discord epoch (2015-01-01)
  const DISCORD_EPOCH = 1420070400000n;
  const snowflake = BigInt(userId);
  const timestamp = Number((snowflake >> 22n) + DISCORD_EPOCH);
  return (Date.now() - timestamp) / MS_PER_DAY;
}

function scoreAccountAge(ageDays: number): { score: number; label: string } {
  if (ageDays >= 365 * 5) return { score: 0, label: "5+ years (Very Low risk)" };
  if (ageDays >= 365 * 3) return { score: 10, label: "3+ years (Low risk)" };
  if (ageDays >= 365) return { score: 25, label: "1+ year (Medium risk)" };
  if (ageDays >= 30) return { score: 45, label: "30+ days (High risk)" };
  if (ageDays >= 7) return { score: 65, label: "7–30 days (Very High risk)" };
  if (ageDays >= 1) return { score: 80, label: "1–7 days (Critical risk)" };
  return { score: 95, label: "Under 24 hours (Maximum risk)" };
}

function hasQualityUsername(username: string): boolean {
  // Flag bot-like patterns: all numbers, excessive underscores, very short, random chars
  if (username.length < 3) return false;
  if (/^\d+$/.test(username)) return false; // all numbers
  if ((username.match(/_/g) ?? []).length > 3) return false; // excessive underscores
  if (/^[a-z]{1,4}\d{4,}$/.test(username)) return false; // letter+numbers pattern common for bots
  return true;
}

export function assessRisk(member: GuildMember): RiskAssessment {
  const ageDays = getAccountAgeDays(member.id);
  const hasAvatar = !!member.user.avatar;
  const hasBanner = !!member.user.banner;
  const hasDisplayName = member.displayName !== member.user.username;
  const usernameQuality = hasQualityUsername(member.user.username);

  const { score: ageScore } = scoreAccountAge(ageDays);
  const signals: string[] = [];
  let bonusRisk = 0;

  if (!hasAvatar) {
    bonusRisk += 8;
    signals.push("No profile picture");
  }
  if (!hasBanner) {
    bonusRisk += 3;
    signals.push("No profile banner");
  }
  if (!hasDisplayName) {
    bonusRisk += 3;
    signals.push("No display name set");
  }
  if (!usernameQuality) {
    bonusRisk += 10;
    signals.push("Suspicious username pattern");
  }

  const totalScore = Math.min(100, ageScore + bonusRisk);

  let tier: RiskTier;
  // Tier 1: ≥5 years + avatar + no major signals
  if (ageDays >= 365 * 5 && hasAvatar && totalScore <= 5) {
    tier = 1;
  } else if (ageDays >= 365) {
    // Tier 2: 1–5 years
    tier = totalScore <= 30 ? 2 : 3;
  } else if (ageDays >= 30) {
    // Tier 3: 30–365 days
    tier = 3;
  } else if (ageDays >= 7) {
    // Tier 4: 7–30 days
    tier = 4;
  } else if (ageDays >= 1) {
    // Tier 5: 1–7 days
    tier = 5;
  } else {
    // Tier 6: under 24h
    tier = 6;
  }

  logger.info(
    { userId: member.id, score: totalScore, tier, ageDays: Math.floor(ageDays), signals },
    "Risk assessment complete"
  );

  return { score: totalScore, tier, signals, accountAgeDays: ageDays, hasAvatar, hasBanner };
}

export function getTierLabel(tier: RiskTier): string {
  const labels: Record<RiskTier, string> = {
    1: "Trusted",
    2: "Normal",
    3: "Newer Account",
    4: "High Risk",
    5: "Extreme Risk",
    6: "Fresh Account",
  };
  return labels[tier];
}

export function getTierColor(tier: RiskTier): number {
  const colors: Record<RiskTier, number> = {
    1: 0x57f287, // green
    2: 0x5865f2, // blurple
    3: 0xfee75c, // yellow
    4: 0xed4245, // red
    5: 0xeb459e, // fuchsia
    6: 0x2f3136, // dark
  };
  return colors[tier];
}
