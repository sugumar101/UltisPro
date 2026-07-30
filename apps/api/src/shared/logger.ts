import pino from 'pino';
import { env } from '../config/env';

export const logger = pino({
  level: env.NODE_ENV === 'production' ? 'info' : 'debug',
  transport:
    env.NODE_ENV === 'production'
      ? undefined
      : {
          target: 'pino-pretty',
          options: {
            colorize: true,
            translateTime: 'HH:MM:ss',
            // One readable line per request instead of a pretty-printed
            // object tree. `req`/`res`/`responseTime` are folded into the
            // message by pino-http's customSuccessMessage (see app.ts), so
            // repeating them below the line is pure noise.
            ignore: 'pid,hostname,req,res,responseTime,reqId',
            singleLine: true,
          },
        },
});
