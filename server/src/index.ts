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
  app.use(cors());

  app.use(
    '/graphql',
    express.json(),
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
  const sseServer = createServer((req, res) => {
    if (!req.url || req.method !== 'GET') {
      res.statusCode = 404;
      res.end();
      return;
    }

    if (req.url === '/events/meals') {
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

    if (!req.url.startsWith('/events/meals/')) {
      res.statusCode = 404;
      res.end();
      return;
    }

    const mealId = req.url.replace('/events/meals/', '').split('?')[0];
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
