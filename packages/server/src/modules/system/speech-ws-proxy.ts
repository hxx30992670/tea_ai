import WebSocket from 'ws';
import { JwtService } from '@nestjs/jwt';
import { SystemService } from './system.service';
import { AuthUser } from '../../common/types/auth-user.type';

const DASHSCOPE_WS_URL = 'wss://dashscope.aliyuncs.com/api-ws/v1/inference';

export function setupSpeechWsProxy(
  jwtService: JwtService,
  systemService: SystemService,
  server: any,
) {
  const wss = new WebSocket.Server({
    noServer: true,
  });

  server.on('upgrade', (request: any, socket: any, head: any) => {
    const url = new URL(request.url, `http://${request.headers.host || 'localhost'}`);
    if (url.pathname !== '/api/speech/ws') {
      return;
    }

    const token = url.searchParams.get('token');
    if (!token) {
      socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
      socket.destroy();
      return;
    }

    let user: AuthUser;
    try {
      user = jwtService.verify<AuthUser>(token, {
        secret: process.env.JWT_ACCESS_SECRET,
      });
    } catch {
      socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
      socket.destroy();
      return;
    }

    systemService.getSpeechProviderConfig(user).then((speechConfig) => {
      if (!speechConfig.enabled || !speechConfig.apiKey) {
        socket.write('HTTP/1.1 403 Forbidden\r\n\r\n');
        socket.destroy();
        return;
      }

      wss.handleUpgrade(request, socket, head, (clientWs) => {
        wss.emit('connection', clientWs, request, speechConfig.apiKey);
      });
    }).catch(() => {
      socket.write('HTTP/1.1 500 Internal Server Error\r\n\r\n');
      socket.destroy();
    });
  });

  wss.on('connection', (clientWs: WebSocket, _req: any, apiKey: string) => {
    const dashWs = new WebSocket(DASHSCOPE_WS_URL, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });

    dashWs.on('open', () => {
      if (clientWs.readyState === WebSocket.OPEN) {
        clientWs.send(JSON.stringify({ event: 'proxy-ready' }));
      }
    });

    dashWs.on('message', (data: WebSocket.Data, isBinary: boolean) => {
      if (clientWs.readyState === WebSocket.OPEN) {
        clientWs.send(data, { binary: isBinary });
      }
    });

    dashWs.on('error', () => {
      if (clientWs.readyState === WebSocket.OPEN) {
        clientWs.close(4002, '语音服务连接异常');
      }
    });

    dashWs.on('close', (code: number, reason: string) => {
      if (clientWs.readyState === WebSocket.OPEN) {
        clientWs.close(code, reason);
      }
    });

    clientWs.on('message', (data: WebSocket.Data, isBinary: boolean) => {
      if (dashWs.readyState === WebSocket.OPEN) {
        dashWs.send(data, { binary: isBinary });
      }
    });

    clientWs.on('close', () => {
      if (dashWs.readyState === WebSocket.OPEN) {
        dashWs.close();
      }
    });

    clientWs.on('error', () => {
      if (dashWs.readyState === WebSocket.OPEN) {
        dashWs.close();
      }
    });
  });
}
