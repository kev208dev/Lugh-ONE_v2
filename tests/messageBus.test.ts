import { describe, it, expect, afterEach } from 'vitest';
import { createMessageBus } from '../src/runtime/MessageBus';
import type { BusMessage, MessageBus } from '../src/runtime/types';

describe('MessageBus (BroadcastChannel-backed)', () => {
  const buses: MessageBus[] = [];

  afterEach(() => {
    while (buses.length) {
      buses.pop()?.close();
    }
  });

  it('delivers a message sent from one bus instance to a subscriber on another, same session', async () => {
    const sessionId = 'same-session';
    const busA = createMessageBus(sessionId); // simulates e.g. the launcher window
    const busB = createMessageBus(sessionId); // simulates e.g. a popup window
    buses.push(busA, busB);

    const received: BusMessage[] = [];
    const unsubscribe = busB.subscribe((msg) => {
      received.push(msg);
    });

    const msg: BusMessage = {
      type: 'geometry-update',
      geometry: {
        id: 'sun',
        screenX: 1,
        screenY: 2,
        outerWidth: 260,
        outerHeight: 200,
        innerWidth: 244,
        innerHeight: 160,
        chromeInsetTop: 40,
        chromeInsetLeft: 8,
        timestamp: Date.now()
      }
    };

    busA.send(msg);

    // BroadcastChannel delivery is asynchronous even within jsdom.
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(received).toHaveLength(1);
    expect(received[0]).toEqual(msg);

    unsubscribe();
  });

  it('does not deliver messages after unsubscribe()', async () => {
    const sessionId = 'same-session-2';
    const busA = createMessageBus(sessionId);
    const busB = createMessageBus(sessionId);
    buses.push(busA, busB);

    const received: BusMessage[] = [];
    const unsubscribe = busB.subscribe((msg) => received.push(msg));
    unsubscribe();

    busA.send({ type: 'hello', id: 'sun', sessionId, launchId: 'launch-2' });
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(received).toHaveLength(0);
  });

  it('does not deliver messages across different sessions', async () => {
    const busA = createMessageBus('session-x');
    const busB = createMessageBus('session-y');
    buses.push(busA, busB);

    const received: BusMessage[] = [];
    busB.subscribe((msg) => received.push(msg));

    busA.send({ type: 'hello', id: 'sun', sessionId: 'session-x', launchId: 'launch-x' });
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(received).toHaveLength(0);
  });
});
