import { createCanvas, loadImage } from "@napi-rs/canvas";
import type { SKRSContext2D } from "@napi-rs/canvas";
import type { RiskTier } from "./riskScoring";
import { logger } from "../../lib/logger";

const WIDTH = 800;
const HEIGHT = 280;

function accentColor(tier: RiskTier): string {
  const colors: Record<RiskTier, string> = {
    1: "#57f287", 2: "#5865f2", 3: "#fee75c",
    4: "#ed4245", 5: "#eb459e", 6: "#5865f2",
  };
  return colors[tier];
}

function formatDate(date: Date): string {
  return date.toLocaleDateString("en-US", {
    year: "numeric", month: "short", day: "numeric",
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
  const accent = accentColor(opts.tier);

  // Background
  ctx.fillStyle = "#0f1117";
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  // Subtle gradient overlay
  const glow = ctx.createRadialGradient(120, HEIGHT / 2, 0, 120, HEIGHT / 2, 300);
  glow.addColorStop(0, `${accent}18`);
  glow.addColorStop(1, "transparent");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  // Card border
  ctx.strokeStyle = "rgba(255,255,255,0.08)";
  ctx.lineWidth = 1;
  drawRoundedRect(ctx, 1, 1, WIDTH - 2, HEIGHT - 2, 16);
  ctx.stroke();

  // Left accent bar
  ctx.fillStyle = accent;
  drawRoundedRect(ctx, 0, 0, 5, HEIGHT, 3);
  ctx.fill();

  // Avatar
  const avatarSize = 100;
  const avatarX = 36;
  const avatarY = (HEIGHT - avatarSize) / 2;
  const cx = avatarX + avatarSize / 2;
  const cy = avatarY + avatarSize / 2;

  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, avatarSize / 2, 0, Math.PI * 2);
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
    ctx.font = "bold 40px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(opts.username[0]?.toUpperCase() ?? "?", cx, cy);
  }
  ctx.restore();

  // Avatar ring
  ctx.beginPath();
  ctx.arc(cx, cy, avatarSize / 2 + 3, 0, Math.PI * 2);
  ctx.strokeStyle = accent;
  ctx.lineWidth = 2.5;
  ctx.stroke();

  // Name section
  const textX = 160;
  const name = opts.displayName ?? opts.username;

  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 28px sans-serif";
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  ctx.fillText(name, textX, 90);

  if (opts.displayName) {
    ctx.fillStyle = "#72767d";
    ctx.font = "16px sans-serif";
    ctx.fillText(`@${opts.username}`, textX, 114);
  }

  // VERIFIED badge
  const badgeX = textX;
  const badgeY = opts.displayName ? 126 : 106;
  ctx.fillStyle = "#57f28718";
  drawRoundedRect(ctx, badgeX, badgeY, 100, 26, 13);
  ctx.fill();
  ctx.strokeStyle = "#57f287";
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.fillStyle = "#57f287";
  ctx.font = "bold 12px sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("✓ VERIFIED", badgeX + 50, badgeY + 17);

  // Vertical divider
  ctx.strokeStyle = "rgba(255,255,255,0.08)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(460, 36);
  ctx.lineTo(460, HEIGHT - 36);
  ctx.stroke();

  // Right: info fields
  const infoX = 490;
  const fields = [
    { label: "USER ID", value: opts.userId },
    { label: "ACCOUNT CREATED", value: formatDate(opts.accountCreatedAt) },
    { label: "JOINED SERVER", value: formatDate(opts.joinedAt) },
    { label: "VERIFIED", value: formatDate(opts.verifiedAt) },
  ];

  fields.forEach((f, i) => {
    const fy = 52 + i * 52;
    ctx.fillStyle = "#72767d";
    ctx.font = "bold 10px sans-serif";
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
    ctx.fillText(f.label, infoX, fy);
    ctx.fillStyle = "#dcddde";
    ctx.font = "14px sans-serif";
    ctx.fillText(f.value, infoX, fy + 20);
  });

  // Footer
  ctx.fillStyle = "rgba(255,255,255,0.03)";
  ctx.fillRect(0, HEIGHT - 30, WIDTH, 30);
  ctx.fillStyle = "#4f545c";
  ctx.font = "11px sans-serif";
  ctx.textAlign = "left";
  ctx.fillText("Trust Guard  •  Verification System", 16, HEIGHT - 10);
  ctx.textAlign = "right";
  ctx.fillText(new Date().getFullYear().toString(), WIDTH - 16, HEIGHT - 10);

  return canvas.toBuffer("image/png") as unknown as Buffer;
}
