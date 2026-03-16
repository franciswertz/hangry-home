import 'dotenv/config';
import { createServer } from 'http';
import cors from 'cors';
import express from 'express';
import { ApolloServer } from '@apollo/server';
import { expressMiddleware } from '@apollo/server/express4';
import { typeDefs } from './schema/typeDefs.js';
import { resolvers } from './resolvers/index.js';
import { loadAgentQConfig } from './config/agentq.js';
import { AgentQJobQueueService } from './services/AgentQJobQueueService.js';
import { NoOpJobQueueService, type JobQueueService } from './services/JobQueueService.js';
import { onAllMealEvents, onMealEvent } from './events/mealEvents.js';
import { requireAuth, verifyRequestAuth } from './auth/auth.js';

async function startServer() {
  const jobQueueProvider = process.env.JOB_QUEUE_PROVIDER ?? 'noop';
  const jobQueue: JobQueueService = jobQueueProvider === 'agentq'
    ? new AgentQJobQueueService(loadAgentQConfig())
    : new NoOpJobQueueService();

  const server = new ApolloServer<{ jobQueue: JobQueueService }>({
    typeDefs,
    resolvers,
  });

  const port = Number(process.env.PORT ?? 4000);
  await server.start();

  const app = express();
  app.use((req, res, next) => {
    const start = Date.now();
    res.on('finish', () => {
      const duration = Date.now() - start;
      console.log(`[HTTP] ${req.method} ${req.url} ${res.statusCode} ${duration}ms`);
    });
    next();
  });
  app.use(cors({
    origin: true,
    credentials: true,
    allowedHeaders: ['Content-Type', 'Authorization'],
  }));

  app.get('/health', (_req, res) => {
    res.json({
      status: 'ok',
      uptime: process.uptime(),
      jobQueue: jobQueue.getStatus(),
    });
  });

  app.use(
    '/graphql',
    express.json(),
    requireAuth,
    expressMiddleware(server, {
      context: async () => ({
        jobQueue,
      }),
    })
  );

  const httpServer = createServer(app);
  httpServer.listen(port, () => {
    console.log(`🚀 Server ready at: http://localhost:${port}/graphql`);
  });

  const ssePort = Number(process.env.SSE_PORT ?? 4001);
  const sseServer = createServer(async (req, res) => {
    const authResult = await verifyRequestAuth(req);
    if (!authResult.ok) {
      res.statusCode = authResult.status;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ error: authResult.message }));
      return;
    }

    if (!req.url || req.method !== 'GET') {
      res.statusCode = 404;
      res.end();
      return;
    }

    const requestPath = new URL(req.url, 'http://localhost').pathname;

    if (requestPath === '/events/meals') {
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
        'Access-Control-Allow-Origin': '*',
        'X-Accel-Buffering': 'no',
      });
      res.flushHeaders();
      req.socket.setTimeout(0);

      res.write('event: connected\n');
      res.write('data: {}\n\n');

      const removeListener = onAllMealEvents((event) => {
        res.write(`data: ${JSON.stringify(event)}\n\n`);
      });

      const keepAlive = setInterval(() => {
        res.write(': keep-alive\n\n');
      }, 15000);

      req.on('close', () => {
        clearInterval(keepAlive);
        removeListener();
        res.end();
      });
      return;
    }

    if (!requestPath.startsWith('/events/meals/')) {
      res.statusCode = 404;
      res.end();
      return;
    }

    const mealId = requestPath.replace('/events/meals/', '');
    if (!mealId) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'mealId required' }));
      return;
    }

    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'Access-Control-Allow-Origin': '*',
      'X-Accel-Buffering': 'no',
    });
    res.flushHeaders();
    req.socket.setTimeout(0);

    res.write('event: connected\n');
    res.write(`data: ${JSON.stringify({ mealId })}\n\n`);

    const removeListener = onMealEvent(mealId, (event) => {
      res.write(`data: ${JSON.stringify(event)}\n\n`);
    });

    const keepAlive = setInterval(() => {
      res.write(': keep-alive\n\n');
    }, 15000);

    req.on('close', () => {
      clearInterval(keepAlive);
      removeListener();
      res.end();
    });
  });

  sseServer.listen(ssePort, () => {
    console.log(`📡 SSE ready at: http://localhost:${ssePort}/events/meals`);
  });

  const shutdown = () => {
    if ('shutdown' in jobQueue && typeof jobQueue.shutdown === 'function') {
      jobQueue.shutdown();
    }
    httpServer.close(() => {
      sseServer.close(() => {
        process.exit(0);
      });
    });
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

startServer();
