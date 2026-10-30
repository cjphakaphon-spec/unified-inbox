import { io, Socket } from 'socket.io-client';
import { API_BASE } from '../config';

let socket: Socket | null = null;

export function getSocket(): Socket {
  if (!socket) {
    socket = io(API_BASE || '/', {
      transports: ['websocket', 'polling'],
      autoConnect: true,
    });
  }
  return socket;
}
