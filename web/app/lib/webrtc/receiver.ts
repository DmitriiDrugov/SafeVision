'use client'

import {
  createPeer,
  type MediaConnection,
  type PeerType,
} from './peer'

export interface ReceiverHandlers {
  onStream: (stream: MediaStream) => void
  onClose: () => void
  onError: (err: Error) => void
}

/**
 * Bring up a Peer at the given id and wait for an incoming call. Returns a
 * tear-down function that destroys both the call and the peer.
 *
 * Re-use of an existing peer id is tolerated — the broker simply replaces the
 * registration if a previous tab is still holding it.
 */
export async function startReceiver(
  peerId: string,
  handlers: ReceiverHandlers,
): Promise<() => void> {
  let call: MediaConnection | null = null
  let peer: PeerType | null = null
  try {
    peer = await createPeer(peerId)
  } catch (e) {
    handlers.onError(e instanceof Error ? e : new Error(String(e)))
    return () => undefined
  }

  peer.on('call', (incoming) => {
    call?.close()
    call = incoming
    incoming.answer() // receive-only
    incoming.on('stream', (stream) => { handlers.onStream(stream); })
    incoming.on('close', () => { handlers.onClose(); })
    incoming.on('error', (err) =>
      { handlers.onError(err instanceof Error ? err : new Error(String(err))); },
    )
  })

  peer.on('error', (err) => {
    handlers.onError(err instanceof Error ? err : new Error(String(err)))
  })

  return () => {
    call?.close()
    peer?.destroy()
    call = null
    peer = null
  }
}
