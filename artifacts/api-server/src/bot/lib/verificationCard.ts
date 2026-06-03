import { createCanvas, loadImage, GlobalFonts } from "@napi-rs/canvas";
import type { SKRSContext2D } from "@napi-rs/canvas";
import type { RiskTier } from "./riskScoring";
import { logger } from "../../lib/logger";
import { writeFileSync, existsSync, mkdirSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

const WIDTH = 800;
const HEIGHT = 260;

// ── Font bootstrap ────────────────────────────────────────────────────────────
// Railway containers have no system fonts by default. We try system fonts first
// (installed via nixpacks.toml), then fall back to downloading Noto Sans once.

const FONT_DIR = join(tmpdir(), "tg-fonts");
const FONT_PATH = join(FONT_DIR, "NotoSans-Regular.ttf");
const FONT_BOLD_PATH = join(FONT_DIR, "NotoSans-Bold.ttf");
const FONT_FAMILY = "NotoSans";

// jsdelivr mirrors the Google Noto fonts repo — reliable CDN, no auth needed
const FONT_URLS: Record<string, string> = {
  [FONT_PATH]: "https://cdn.jsdelivr.net/gh/notofonts/noto-fonts@main/hinted/ttf/NotoSans/NotoSans-Regular.ttf",
  [FONT_BOLD_PATH]: "https://cdn.jsdelivr.net/gh/notofonts/noto-fonts@main/hinted/ttf/NotoSans/NotoSans-Bold.ttf",
};

let fontsReady = false;

async function downloadFont(url: string, dest: string): Promise<void> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Font fetch failed: ${res.status} ${url}`);
  const buf = Buffer.from(await res.arrayBuffer());
  writeFileSync(dest, buf);
}

async function ensureFonts(): Promise<void> {
  if (fontsReady) return;

  // Attempt 1 — system fonts (installed by nixpacks.toml on Railway)
  GlobalFonts.loadSystemFonts();
  const systemFamilies = GlobalFonts.families;
  if (systemFamilies.length > 0) {
    logger.info({ count: systemFamilies.length }, "Loaded system fonts for canvas");
    fontsReady = true;
    return;
  }

  // Attempt 2 — download Noto Sans to /tmp
  logger.warn("No system fonts found — downloading Noto Sans fallback");
  try {
    mkdirSync(FONT_DIR, { recursive: true });
    for (const [dest, url] of Object.entries(FONT_URLS)) {
      if (!existsSync(dest)) await downloadFont(url, dest);
    }
    GlobalFonts.registerFromPath(FONT_PATH, FONT_FAMILY);
    GlobalFonts.registerFromPath(FONT_BOLD_PATH, FONT_FAMILY);
    logger.info("Downloaded and registered Noto Sans fallback font");
  } catch (err) {
    logger.error({ err }, "Font download failed — text may not render");
  }
  fontsReady = true;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function accentColor(tier: RiskTier): string {
  const colors: Record<RiskTier, string> = {
    1: "#57f287", 2: "#5865f2", 3: "#fee75c",
    4: "#ed4245", 5: "#eb459e", 6: "#99aab5",
  };
  return colors[tier];
}

function tierLabel(tier: RiskTier): string {
  const labels: Record<RiskTier, string> = {
    1: "Trusted", 2: "Normal", 3: "Newer Account",
    4: "High Risk", 5: "Extreme Risk", 6: "Fresh Account",
  };
  return labels[tier];
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

// ── Card ──────────────────────────────────────────────────────────────────────

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
  await ensureFonts();

  const canvas = createCanvas(WIDTH, HEIGHT);
  const ctx = canvas.getContext("2d");
  const accent = accentColor(opts.tier);

  const font = (size: number, weight: "normal" | "bold" = "normal") =>
    `${weight === "bold" ? "bold " : ""}${size}px ${FONT_FAMILY}, sans-serif`;

  // ── Background ──
  ctx.fillStyle = "#0f1117";
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  // Subtle accent glow (top-left quadrant)
  const glow = ctx.createRadialGradient(140, HEIGHT / 2, 0, 140, HEIGHT / 2, 280);
  glow.addColorStop(0, `${accent}15`);
  glow.addColorStop(1, "transparent");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  // ── Left accent bar ──
  ctx.fillStyle = accent;
  drawRoundedRect(ctx, 0, 0, 4, HEIGHT, 2);
  ctx.fill();

  // ── Card border ──
  ctx.strokeStyle = "rgba(255,255,255,0.07)";
  ctx.lineWidth = 1;
  drawRoundedRect(ctx, 0.5, 0.5, WIDTH - 1, HEIGHT - 1, 12);
  ctx.stroke();

  // ── Avatar ──
  const avatarSize = 80;
  const avatarX = 30;
  const avatarY = (HEIGHT - avatarSize) / 2;
  const cx = avatarX + avatarSize / 2;
  const cy = avatarY + avatarSize / 2;

  // Avatar clip + draw
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, avatarSize / 2, 0, Math.PI * 2);
  ctx.clip();
  if (opts.avatarUrl) {
    try {
      const img = await loadImage(opts.avatarUrl.replace(/\?.*$/, "") + "?size=128");
      ctx.drawImage(img, avatarX, avatarY, avatarSize, avatarSize);
    } catch {
      ctx.fillStyle = "#2f3136";
      ctx.fillRect(avatarX, avatarY, avatarSize, avatarSize);
    }
  } else {
    ctx.fillStyle = "#2f3136";
    ctx.fillRect(avatarX, avatarY, avatarSize, avatarSize);
    ctx.fillStyle = "#72767d";
    ctx.font = font(32, "bold");
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(opts.username[0]?.toUpperCase() ?? "?", cx, cy);
  }
  ctx.restore();

  // Avatar ring
  ctx.beginPath();
  ctx.arc(cx, cy, avatarSize / 2 + 2.5, 0, Math.PI * 2);
  ctx.strokeStyle = accent;
  ctx.lineWidth = 2;
  ctx.stroke();

  // ── Left column: name + badge + tier ──
  const nameX = 126;
  const displayName = opts.displayName ?? opts.username;

  ctx.fillStyle = "#ffffff";
  ctx.font = font(24, "bold");
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  ctx.fillText(displayName, nameX, 82);

  if (opts.displayName) {
    ctx.fillStyle = "#72767d";
    ctx.font = font(13);
    ctx.fillText(`@${opts.username}`, nameX, 102);
  }

  // VERIFIED badge
  const badgeY = opts.displayName ? 112 : 94;
  const badgeW = 90;
  const badgeH = 22;
  ctx.fillStyle = `${accent}22`;
  drawRoundedRect(ctx, nameX, badgeY, badgeW, badgeH, 11);
  ctx.fill();
  ctx.strokeStyle = accent;
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.fillStyle = accent;
  ctx.font = font(11, "bold");
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("VERIFIED", nameX + badgeW / 2, badgeY + badgeH / 2);

  // Tier label
  ctx.fillStyle = "#72767d";
  ctx.font = font(12);
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  ctx.fillText(`Tier ${opts.tier}  —  ${tierLabel(opts.tier)}`, nameX, badgeY + badgeH + 20);

  // ── Divider ──
  ctx.strokeStyle = "rgba(255,255,255,0.07)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(430, 30);
  ctx.lineTo(430, HEIGHT - 30);
  ctx.stroke();

  // ── Right column: info fields ──
  const infoX = 458;
  const fields: { label: string; value: string }[] = [
    { label: "USER ID", value: opts.userId },
    { label: "ACCOUNT CREATED", value: formatDate(opts.accountCreatedAt) },
    { label: "JOINED SERVER", value: formatDate(opts.joinedAt) },
    { label: "VERIFIED AT", value: formatDate(opts.verifiedAt) },
  ];

  fields.forEach((f, i) => {
    const fy = 42 + i * 50;
    ctx.fillStyle = "#4f545c";
    ctx.font = font(10, "bold");
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
    ctx.fillText(f.label, infoX, fy);
    ctx.fillStyle = "#dcddde";
    ctx.font = font(14);
    ctx.fillText(f.value, infoX, fy + 19);
  });

  // ── Footer strip ──
  ctx.fillStyle = "rgba(255,255,255,0.025)";
  ctx.fillRect(0, HEIGHT - 26, WIDTH, 26);
  ctx.fillStyle = "#4f545c";
  ctx.font = font(10);
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillText("Trust Guard  •  Verification System", 14, HEIGHT - 13);
  ctx.textAlign = "right";
  ctx.fillText(String(new Date().getFullYear()), WIDTH - 14, HEIGHT - 13);

  return canvas.toBuffer("image/png") as unknown as Buffer;
}
