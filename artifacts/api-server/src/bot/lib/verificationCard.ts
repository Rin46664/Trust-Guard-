import { createCanvas, loadImage } from "@napi-rs/canvas";
import type { SKRSContext2D } from "@napi-rs/canvas";
import type { RiskTier } from "./riskScoring";
import { logger } from "../../lib/logger";

const WIDTH = 1200;
const HEIGHT = 675;

function tierColor(tier: RiskTier): string {
  const colors: Record<RiskTier, string> = {
    1: "#57f287", 2: "#5865f2", 3: "#fee75c",
    4: "#ed4245", 5: "#eb459e", 6: "#4f545c",
  };
  return colors[tier];
}

function tierLabel(tier: RiskTier): string {
  const labels: Record<RiskTier, string> = {
    1: "TRUSTED", 2: "NORMAL", 3: "NEWER ACCOUNT",
    4: "HIGH RISK", 5: "EXTREME RISK", 6: "FRESH ACCOUNT",
  };
  return labels[tier];
}

function riskLabel(score: number): string {
  if (score <= 10) return "VERY LOW";
  if (score <= 25) return "LOW";
  if (score <= 45) return "MEDIUM";
  if (score <= 65) return "HIGH";
  if (score <= 80) return "CRITICAL";
  return "MAXIMUM";
}

function formatDate(date: Date): string {
  return date.toLocaleDateString("en-US", {
    year: "numeric", month: "short", day: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

function drawRoundedRect(ctx: SKRSContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

export interface CardOptions {
  username: string;
  displayName: string | null;
  userId: string;
  avatarUrl: string | null;
  accountCreatedAt: Date;
  joinedAt: Date;
  riskScore: number;
  tier: RiskTier;
  verifiedAt: Date;
}

export async function generateVerificationCard(opts: CardOptions): Promise<Buffer> {
  const canvas = createCanvas(WIDTH, HEIGHT);
  const ctx = canvas.getContext("2d");
  const accent = tierColor(opts.tier);

  // Background
  const bg = ctx.createLinearGradient(0, 0, WIDTH, HEIGHT);
  bg.addColorStop(0, "#0d0f13");
  bg.addColorStop(0.5, "#111318");
  bg.addColorStop(1, "#0a0c10");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  // Subtle grid
  ctx.strokeStyle = "rgba(255,255,255,0.03)";
  ctx.lineWidth = 1;
  for (let x = 0; x < WIDTH; x += 60) {
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, HEIGHT); ctx.stroke();
  }
  for (let y = 0; y < HEIGHT; y += 60) {
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(WIDTH, y); ctx.stroke();
  }

  // Glow
  const glow = ctx.createRadialGradient(0, 0, 0, 0, 0, 500);
  glow.addColorStop(0, `${accent}22`);
  glow.addColorStop(1, "transparent");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  // Glass card
  ctx.fillStyle = "rgba(255,255,255,0.05)";
  drawRoundedRect(ctx, 40, 40, WIDTH - 80, HEIGHT - 80, 24);
  ctx.fill();
  ctx.strokeStyle = "rgba(255,255,255,0.1)";
  ctx.lineWidth = 1;
  ctx.stroke();

  // Accent bar
  ctx.fillStyle = accent;
  drawRoundedRect(ctx, 40, 40, 6, HEIGHT - 80, 3);
  ctx.fill();

  // Avatar
  const avatarX = 80, avatarY = 90, avatarSize = 120;
  ctx.save();
  ctx.beginPath();
  ctx.arc(avatarX + avatarSize / 2, avatarY + avatarSize / 2, avatarSize / 2, 0, Math.PI * 2);
  ctx.clip();

  if (opts.avatarUrl) {
    try {
      const img = await loadImage(opts.avatarUrl + "?size=256");
      ctx.drawImage(img, avatarX, avatarY, avatarSize, avatarSize);
    } catch {
      ctx.fillStyle = "#2f3136";
      ctx.fillRect(avatarX, avatarY, avatarSize, avatarSize);
    }
  } else {
    ctx.fillStyle = "#2f3136";
    ctx.fillRect(avatarX, avatarY, avatarSize, avatarSize);
    ctx.fillStyle = "#72767d";
    ctx.font = "bold 48px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(opts.username[0]?.toUpperCase() ?? "?", avatarX + avatarSize / 2, avatarY + avatarSize / 2);
  }
  ctx.restore();

  // Avatar ring
  ctx.beginPath();
  ctx.arc(avatarX + avatarSize / 2, avatarY + avatarSize / 2, avatarSize / 2 + 3, 0, Math.PI * 2);
  ctx.strokeStyle = accent;
  ctx.lineWidth = 3;
  ctx.stroke();

  // Header label
  ctx.fillStyle = accent;
  ctx.font = "bold 14px sans-serif";
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  ctx.fillText("TRUST GUARD", 240, 118);

  // Name
  const name = opts.displayName ?? opts.username;
  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 42px sans-serif";
  ctx.fillText(name, 240, 165);

  if (opts.displayName) {
    ctx.fillStyle = "#72767d";
    ctx.font = "20px sans-serif";
    ctx.fillText(`@${opts.username}`, 240, 195);
  }

  // Verified badge
  const badgeY = 218;
  ctx.fillStyle = "#57f28722";
  drawRoundedRect(ctx, 240, badgeY, 130, 32, 16);
  ctx.fill();
  ctx.strokeStyle = "#57f287";
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.fillStyle = "#57f287";
  ctx.font = "bold 13px sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("VERIFIED", 305, badgeY + 21);

  // Tier badge
  ctx.fillStyle = `${accent}22`;
  drawRoundedRect(ctx, 386, badgeY, 175, 32, 16);
  ctx.fill();
  ctx.strokeStyle = accent;
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.fillStyle = accent;
  ctx.fillText(`TIER ${opts.tier} - ${tierLabel(opts.tier)}`, 473, badgeY + 21);

  // Divider
  ctx.strokeStyle = "rgba(255,255,255,0.08)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(80, 280); ctx.lineTo(WIDTH - 80, 280); ctx.stroke();

  // Info grid
  const fields = [
    { label: "USER ID", value: opts.userId },
    { label: "ACCOUNT CREATED", value: formatDate(opts.accountCreatedAt) },
    { label: "JOINED SERVER", value: formatDate(opts.joinedAt) },
    { label: "VERIFIED AT", value: formatDate(opts.verifiedAt) },
    { label: "TRUST SCORE", value: `${100 - opts.riskScore}/100` },
    { label: "RISK LEVEL", value: riskLabel(opts.riskScore) },
  ];

  const colW = (WIDTH - 160) / 3;
  fields.forEach((field, i) => {
    const col = i % 3;
    const row = Math.floor(i / 3);
    const fx = 80 + col * colW;
    const fy = 310 + row * 90;

    ctx.fillStyle = "#72767d";
    ctx.font = "bold 11px sans-serif";
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
    ctx.fillText(field.label, fx, fy);
    ctx.fillStyle = "#ffffff";
    ctx.font = "16px sans-serif";
    ctx.fillText(field.value, fx, fy + 24);
  });

  // Bottom bar
  const barY = HEIGHT - 80;
  ctx.fillStyle = "rgba(0,0,0,0.3)";
  drawRoundedRect(ctx, 40, barY, WIDTH - 80, 40, 12);
  ctx.fill();
  ctx.fillStyle = "#72767d";
  ctx.font = "13px sans-serif";
  ctx.textAlign = "left";
  ctx.fillText("Verification powered by Trust Guard", 70, barY + 26);
  ctx.textAlign = "right";
  ctx.fillText(`Tier ${opts.tier} - ${opts.tier <= 2 ? "Auto-Approved" : "Verified"}`, WIDTH - 70, barY + 26);

  return canvas.toBuffer("image/png") as unknown as Buffer;
}
