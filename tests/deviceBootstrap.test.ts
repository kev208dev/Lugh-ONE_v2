import { afterEach, describe, expect, it } from 'vitest';
import { bootstrapDevicePage } from '../src/pages/deviceBootstrap';
import { createMessageBus } from '../src/runtime/MessageBus';
import type { MessageBus, WindowGeometry } from '../src/runtime/types';

describe('bootstrapDevicePage startup handshake', () => {
  const buses: MessageBus[] = [];
  const trackers: Array<{ stop(): void }> = [];

  afterEach(() => {
    while (trackers.length) trackers.pop()?.stop();
    while (buses.length) buses.pop()?.close();
  });

  it('re-sends current geometry when a later peer announces itself', async () => {
    const sun = bootstrapDevicePage('sun');
    trackers.push(sun.tracker);
    buses.push(sun.bus);

    // Created after SUN's one-time startup broadcast, so this peer can only
    // learn SUN's position through the hello/snapshot handshake.
    const peer = createMessageBus(sun.sessionId);
    buses.push(peer);
    const updates: WindowGeometry[] = [];
    peer.subscribe((msg) => {
      if (msg.type === 'geometry-update') updates.push(msg.geometry);
    });

    peer.send({ type: 'hello', id: 'prism', sessionId: sun.sessionId });
    await new Promise((resolve) => setTimeout(resolve, 30));

    expect(updates.some((geometry) => geometry.id === 'sun')).toBe(true);
  });
});
