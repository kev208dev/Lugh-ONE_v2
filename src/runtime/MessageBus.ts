import type { BusMessage, MessageBus } from './types';
import { channelNameFor } from './types';

/**
 * MessageBus implementation backed by BroadcastChannel, scoped per session
 * so retries never cross-talk with a stale channel from a previous launch.
 */
export function createMessageBus(sessionId: string): MessageBus {
  const channel = new BroadcastChannel(channelNameFor(sessionId));

  return {
    send(msg: BusMessage): void {
      channel.postMessage(msg);
    },

    subscribe(handler: (msg: BusMessage) => void): () => void {
      const listener = (event: MessageEvent) => {
        handler(event.data as BusMessage);
      };
      channel.addEventListener('message', listener);
      return () => {
        channel.removeEventListener('message', listener);
      };
    },

    close(): void {
      channel.close();
    }
  };
}
