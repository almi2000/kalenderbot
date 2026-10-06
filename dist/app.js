import { fileURLToPath } from 'node:url';
import fastifyCookie from '@fastify/cookie';
import fastifyFormbody from '@fastify/formbody';
import fastifyStatic from '@fastify/static';
import Fastify from 'fastify';
import { registerAuth } from './web/auth.js';
import { registerRoutes } from './web/routes.js';
const PUBLIC_DIR = fileURLToPath(new URL('../public/', import.meta.url));
export async function buildApp(options) {
    const app = Fastify({
        logger: options.logger ?? true,
        trustProxy: true,
        bodyLimit: 64 * 1024,
    });
    await app.register(fastifyCookie);
    await app.register(fastifyFormbody);
    await app.register(fastifyStatic, { root: PUBLIC_DIR, prefix: '/', index: false });
    registerAuth(app, options.appToken, options.secureCookie);
    registerRoutes(app, options);
    return app;
}
//# sourceMappingURL=app.js.map