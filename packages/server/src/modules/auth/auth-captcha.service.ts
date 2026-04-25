import { BadRequestException, Injectable } from '@nestjs/common';
import { createHash, randomBytes, randomInt, randomUUID, timingSafeEqual } from 'crypto';
import { VerifyLoginCaptchaDto } from './dto/verify-login-captcha.dto';

interface CaptchaRecord {
  id: string;
  answerX: number;
  pieceTop: number;
  pieceSize: number;
  createdAt: number;
  expiresAt: number;
  verifiedTokenHash?: Buffer;
}

const CAPTCHA_WIDTH = 320;
const CAPTCHA_HEIGHT = 180;
const CAPTCHA_SIZE = 56;
const CAPTCHA_TOLERANCE = 12;
const MOBILE_VISUAL_TOLERANCE_PX = 10;
const MOBILE_VIEWPORT_MIN = 240;
const MOBILE_VIEWPORT_MAX = 1200;
const CHALLENGE_TTL_MS = 2 * 60 * 1000;
const VERIFIED_TTL_MS = 90 * 1000;

@Injectable()
export class AuthCaptchaService {
  private readonly challenges = new Map<string, CaptchaRecord>();

  createChallenge() {
    this.pruneExpiredChallenges();

    const id = randomUUID();
    const answerX = randomInt(112, CAPTCHA_WIDTH - CAPTCHA_SIZE - 18);
    const pieceTop = randomInt(34, CAPTCHA_HEIGHT - CAPTCHA_SIZE - 20);
    const createdAt = Date.now();
    const expiresAt = createdAt + CHALLENGE_TTL_MS;
    const themeSeed = randomBytes(16).toString('hex');

    const record: CaptchaRecord = {
      id,
      answerX,
      pieceTop,
      pieceSize: CAPTCHA_SIZE,
      createdAt,
      expiresAt,
    };

    this.challenges.set(id, record);

    return {
      captchaId: id,
      background: this.buildBackgroundImage(themeSeed, answerX, pieceTop),
      piece: this.buildPieceImage(themeSeed, answerX, pieceTop),
      pieceSize: CAPTCHA_SIZE,
      pieceTop,
      sliderMax: CAPTCHA_WIDTH - CAPTCHA_SIZE,
      expiresIn: Math.floor(CHALLENGE_TTL_MS / 1000),
    };
  }

  verifyChallenge(
    dto: VerifyLoginCaptchaDto,
    clientPlatform?: string,
    captchaViewportWidth?: string,
  ) {
    this.pruneExpiredChallenges();

    const record = this.challenges.get(dto.captchaId);
    if (!record) {
      throw new BadRequestException('验证码已失效，请刷新后重试');
    }

    if (!this.isHumanTrail(dto, record.answerX, clientPlatform, captchaViewportWidth)) {
      this.challenges.delete(dto.captchaId);
      throw new BadRequestException('行为验证未通过，请重试');
    }

    const captchaToken = randomBytes(24).toString('base64url');
    record.verifiedTokenHash = this.hashValue(captchaToken);
    record.expiresAt = Date.now() + VERIFIED_TTL_MS;

    return {
      captchaId: record.id,
      captchaToken,
      expiresIn: Math.floor(VERIFIED_TTL_MS / 1000),
    };
  }

  consumeVerifiedCaptcha(captchaId: string, captchaToken: string) {
    this.pruneExpiredChallenges();

    const record = this.challenges.get(captchaId);
    if (!record || !record.verifiedTokenHash) {
      throw new BadRequestException('请先完成安全验证');
    }

    const incomingHash = this.hashValue(captchaToken);
    if (!this.safeCompare(record.verifiedTokenHash, incomingHash)) {
      this.challenges.delete(captchaId);
      throw new BadRequestException('安全验证无效，请重新验证');
    }

    this.challenges.delete(captchaId);
  }

  private isHumanTrail(
    dto: VerifyLoginCaptchaDto,
    answerX: number,
    clientPlatform?: string,
    captchaViewportWidth?: string,
  ) {
    const finalOffset = dto.offsetX;
    const offsetDelta = Math.abs(finalOffset - answerX);

    // base 坐标误差兜底：任何平台都必须通过，防止伪造 viewportWidth 绕过视觉容差
    if (offsetDelta > CAPTCHA_TOLERANCE) {
      return false;
    }

    // 移动端额外校验视觉像素误差；viewportWidth 超出合理区间时忽略该校验
    if (clientPlatform === 'mobile') {
      const viewportWidth = Number(captchaViewportWidth);
      const trustworthy =
        Number.isFinite(viewportWidth) &&
        viewportWidth >= MOBILE_VIEWPORT_MIN &&
        viewportWidth <= MOBILE_VIEWPORT_MAX;

      if (trustworthy) {
        const visualDeltaPx = (offsetDelta * viewportWidth) / CAPTCHA_WIDTH;
        if (visualDeltaPx > MOBILE_VISUAL_TOLERANCE_PX) {
          return false;
        }
      }
    }

    if (dto.durationMs < 250 || dto.durationMs > 20000) {
      return false;
    }

    if (!dto.trail.length || dto.trail[dto.trail.length - 1] !== finalOffset) {
      return false;
    }

    let duplicate = 0;
    let positiveMoves = 0;
    let reverseDistance = 0;
    let directionChanges = 0;
    let previousDirection = 0;

    for (let i = 1; i < dto.trail.length; i += 1) {
      const delta = dto.trail[i] - dto.trail[i - 1];
      const direction = delta === 0 ? 0 : delta > 0 ? 1 : -1;

      if (delta < 0) reverseDistance += Math.abs(delta);
      if (delta === 0) duplicate += 1;
      if (delta > 0) positiveMoves += 1;

      if (direction !== 0) {
        if (previousDirection !== 0 && previousDirection !== direction) {
          directionChanges += 1;
        }
        previousDirection = direction;
      }
    }

    const maxReverseDistance = Math.max(CAPTCHA_WIDTH * 0.55, answerX * 0.75);

    if (
      reverseDistance > maxReverseDistance ||
      directionChanges > 12 ||
      duplicate > Math.floor(dto.trail.length * 0.8) ||
      positiveMoves < 3
    ) {
      return false;
    }

    const span = Math.max(...dto.trail) - Math.min(...dto.trail);
    return span >= Math.max(answerX * 0.45, 36);
  }

  private pruneExpiredChallenges() {
    const now = Date.now();
    for (const [id, record] of this.challenges.entries()) {
      if (record.expiresAt <= now) {
        this.challenges.delete(id);
      }
    }
  }

  private buildBackgroundImage(seed: string, answerX: number, pieceTop: number) {
    const imageId = `bg-${seed.slice(0, 8)}`;
    const backgroundSvg = `
      <svg xmlns="http://www.w3.org/2000/svg" width="${CAPTCHA_WIDTH}" height="${CAPTCHA_HEIGHT}" viewBox="0 0 ${CAPTCHA_WIDTH} ${CAPTCHA_HEIGHT}">
        <defs>
          <linearGradient id="${imageId}-bg" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stop-color="#071711" />
            <stop offset="55%" stop-color="#123125" />
            <stop offset="100%" stop-color="#081d15" />
          </linearGradient>
          <filter id="${imageId}-blur" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="14" />
          </filter>
          <filter id="${imageId}-shadow" x="-20%" y="-20%" width="140%" height="140%">
            <feDropShadow dx="0" dy="8" stdDeviation="8" flood-color="rgba(3,10,7,0.55)" />
          </filter>
        </defs>

        <rect width="${CAPTCHA_WIDTH}" height="${CAPTCHA_HEIGHT}" rx="18" fill="url(#${imageId}-bg)" />
        <rect x="1" y="1" width="${CAPTCHA_WIDTH - 2}" height="${CAPTCHA_HEIGHT - 2}" rx="17" fill="none" stroke="rgba(176,255,217,0.12)" />
        ${this.buildScene(seed, imageId)}
        <path d="${this.getPuzzlePath(answerX, pieceTop)}" fill="rgba(233,255,246,0.2)" stroke="rgba(187,255,223,0.75)" stroke-width="2" filter="url(#${imageId}-shadow)" />
        <path d="${this.getPuzzlePath(answerX, pieceTop)}" fill="rgba(4,14,10,0.2)" stroke="rgba(255,255,255,0.18)" stroke-width="1" />
      </svg>
    `;

    return this.toDataUri(backgroundSvg);
  }

  private buildPieceImage(seed: string, answerX: number, pieceTop: number) {
    const imageId = `piece-${seed.slice(0, 8)}`;
    const pieceSvg = `
      <svg xmlns="http://www.w3.org/2000/svg" width="${CAPTCHA_SIZE}" height="${CAPTCHA_SIZE}" viewBox="${answerX} ${pieceTop} ${CAPTCHA_SIZE} ${CAPTCHA_SIZE}">
        <defs>
          <clipPath id="${imageId}-clip">
            <path d="${this.getPuzzlePath(answerX, pieceTop)}" />
          </clipPath>
          <filter id="${imageId}-blur" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="14" />
          </filter>
          <filter id="${imageId}-piece-shadow" x="-20%" y="-20%" width="140%" height="140%">
            <feDropShadow dx="0" dy="5" stdDeviation="4" flood-color="rgba(2,6,4,0.45)" />
          </filter>
        </defs>

        <g clip-path="url(#${imageId}-clip)" filter="url(#${imageId}-piece-shadow)">
          <rect x="0" y="0" width="${CAPTCHA_WIDTH}" height="${CAPTCHA_HEIGHT}" fill="#081510" />
          ${this.buildScene(seed, imageId)}
          <rect x="${answerX}" y="${pieceTop}" width="${CAPTCHA_SIZE}" height="${CAPTCHA_SIZE}" fill="rgba(255,255,255,0.04)" />
        </g>
        <path d="${this.getPuzzlePath(answerX, pieceTop)}" fill="rgba(255,255,255,0.08)" stroke="rgba(227,255,242,0.88)" stroke-width="2" />
      </svg>
    `;

    return this.toDataUri(pieceSvg);
  }

  private buildScene(seed: string, imageId: string) {
    const rand = this.createSeededRandom(seed);
    const blobs = Array.from({ length: 6 }, (_, index) => {
      const cx = Math.round(rand() * CAPTCHA_WIDTH);
      const cy = Math.round(rand() * CAPTCHA_HEIGHT);
      const radius = Math.round(26 + rand() * 42);
      const opacity = (0.08 + rand() * 0.16).toFixed(2);
      const hue = index % 2 === 0 ? '#52b788' : '#d9b76c';
      return `<circle cx="${cx}" cy="${cy}" r="${radius}" fill="${hue}" opacity="${opacity}" filter="url(#${imageId}-blur)" />`;
    }).join('');

    const waves = Array.from({ length: 3 }, (_, index) => {
      const y = Math.round(26 + rand() * 118);
      const start = Math.round(rand() * 24);
      const c1x = Math.round(80 + rand() * 40);
      const c1y = y - Math.round(22 + rand() * 16);
      const c2x = Math.round(180 + rand() * 30);
      const c2y = y + Math.round(12 + rand() * 20);
      const end = CAPTCHA_WIDTH - Math.round(rand() * 18);
      const stroke = index === 1 ? 'rgba(255,255,255,0.12)' : 'rgba(82,183,136,0.16)';
      return `<path d="M ${start} ${y} C ${c1x} ${c1y}, ${c2x} ${c2y}, ${end} ${y}" fill="none" stroke="${stroke}" stroke-width="${1 + index}" stroke-linecap="round" />`;
    }).join('');

    const grid = Array.from({ length: 8 }, (_, index) => {
      const x = 24 + index * 38;
      return `<line x1="${x}" y1="0" x2="${x}" y2="${CAPTCHA_HEIGHT}" stroke="rgba(255,255,255,0.05)" />`;
    }).join('') + Array.from({ length: 4 }, (_, index) => {
      const y = 30 + index * 36;
      return `<line x1="0" y1="${y}" x2="${CAPTCHA_WIDTH}" y2="${y}" stroke="rgba(255,255,255,0.04)" />`;
    }).join('');

    const sparks = Array.from({ length: 22 }, () => {
      const x = Math.round(rand() * CAPTCHA_WIDTH);
      const y = Math.round(rand() * CAPTCHA_HEIGHT);
      const size = (0.8 + rand() * 1.8).toFixed(2);
      return `<circle cx="${x}" cy="${y}" r="${size}" fill="rgba(233,255,245,0.66)" />`;
    }).join('');

    return `${blobs}${grid}${waves}${sparks}`;
  }

  private getPuzzlePath(x: number, y: number) {
    const size = CAPTCHA_SIZE;
    const notch = 11;
    const shoulder = 8;

    return [
      `M ${x} ${y}`,
      `H ${x + size / 2 - notch}`,
      `C ${x + size / 2 - shoulder} ${y}, ${x + size / 2 - shoulder} ${y + notch}, ${x + size / 2} ${y + notch}`,
      `C ${x + size / 2 + shoulder} ${y + notch}, ${x + size / 2 + shoulder} ${y}, ${x + size / 2 + notch} ${y}`,
      `H ${x + size}`,
      `V ${y + size / 2 - notch}`,
      `C ${x + size} ${y + size / 2 - shoulder}, ${x + size - notch} ${y + size / 2 - shoulder}, ${x + size - notch} ${y + size / 2}`,
      `C ${x + size - notch} ${y + size / 2 + shoulder}, ${x + size} ${y + size / 2 + shoulder}, ${x + size} ${y + size / 2 + notch}`,
      `V ${y + size}`,
      `H ${x}`,
      'Z',
    ].join(' ');
  }

  private toDataUri(svg: string) {
    return `data:image/svg+xml;base64,${Buffer.from(svg.replace(/\s{2,}/g, ' ').trim()).toString('base64')}`;
  }

  private createSeededRandom(seed: string) {
    let state = parseInt(seed.slice(0, 8), 16) || 1;
    return () => {
      state = (1664525 * state + 1013904223) % 4294967296;
      return state / 4294967296;
    };
  }

  private hashValue(value: string) {
    return createHash('sha256').update(value).digest();
  }

  private safeCompare(left: Buffer, right: Buffer) {
    return left.length === right.length && timingSafeEqual(left, right);
  }
}
