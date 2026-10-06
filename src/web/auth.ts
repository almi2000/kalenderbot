import { createHash, timingSafeEqual } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { loginPage } from './views.js';

const COOKIE_NAME = 'kalender_auth';
const COOKIE_MAX_AGE_SECONDS = 400 * 24 * 60 * 60;
const PUBLIC_PATHS = new Set(['/healthz', '/login', '/manifest.webmanifest', '/sw.js', '/offline.html', '/app.css', '/app.js']);

function digest(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

/**
 * Einfacher Zugangsschutz per Token: `/login?token=...` setzt ein langlebiges Cookie,
 * das auch die installierte PWA (Share Target) mitschickt.
 */
export function registerAuth(app: FastifyInstance, token: string, secureCookie: boolean): void {
  if (!token) {
    app.log.warn('APP_TOKEN ist nicht gesetzt – die Web-App ist ohne Anmeldung erreichbar');
    return;
  }
  const expected = digest(token);

  app.addHook('onRequest', async (request, reply) => {
    const path = request.url.split('?')[0] ?? '/';
    if (PUBLIC_PATHS.has(path) || path.startsWith('/icons/')) return;
    const cookie = request.cookies[COOKIE_NAME];
    if (cookie && safeEqual(cookie, expected)) return;
    return reply.code(401).type('text/html; charset=utf-8').send(loginPage(false));
  });

  app.get<{ Querystring: { token?: string } }>('/login', async (request, reply) => {
    const given = request.query.token ?? '';
    if (!given) return reply.type('text/html; charset=utf-8').send(loginPage(false));
    if (!safeEqual(digest(given), expected)) {
      return reply.code(401).type('text/html; charset=utf-8').send(loginPage(true));
    }
    reply.setCookie(COOKIE_NAME, expected, {
      path: '/',
      httpOnly: true,
      sameSite: 'lax',
      secure: secureCookie,
      maxAge: COOKIE_MAX_AGE_SECONDS,
    });
    return reply.redirect('/');
  });
}
