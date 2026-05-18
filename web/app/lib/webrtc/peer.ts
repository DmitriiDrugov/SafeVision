"use client";

import type { MediaConnection, Peer as PeerType, PeerOptions } from "peerjs";
import { ENV } from "@/lib/env";

type PeerConstructor = new (
  idOrOptions?: string | PeerOptions,
  options?: PeerOptions,
) => PeerType;

let PeerCtor: PeerConstructor | null = null;

/**
 * Lazy-load the peerjs module to keep it out of the initial bundle. The page
 * that uses pairing imports this helper inside an effect, so server-side
 * rendering never touches `peerjs` (which references `navigator`).
 */
async function loadPeer(): Promise<PeerConstructor> {
  if (PeerCtor) return PeerCtor;
  const mod = await import("peerjs");
  PeerCtor = mod.Peer as unknown as PeerConstructor;
  return PeerCtor;
}

export type { MediaConnection, PeerType };

const ICE_SERVERS: RTCIceServer[] = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:global.stun.twilio.com:3478" },
  // OpenRelay free TURN (rate-limited, fine for demo NAT-traversal fallback).
  {
    urls: "turn:openrelay.metered.ca:80",
    username: "openrelayproject",
    credential: "openrelayproject",
  },
];

export function defaultPeerOptions(): PeerOptions {
  return {
    host: ENV.peer.host,
    port: ENV.peer.port,
    secure: ENV.peer.secure,
    config: { iceServers: ICE_SERVERS },
    debug: 1,
  };
}

/**
 * Create a Peer bound to the given id. The promise resolves when the broker
 * acknowledges the registration, or rejects on timeout / error.
 */
export async function createPeer(
  id: string,
  options?: Partial<PeerOptions>,
): Promise<PeerType> {
  const Peer = await loadPeer();
  const peer = new Peer(id, { ...defaultPeerOptions(), ...options });
  return new Promise<PeerType>((resolve, reject) => {
    const onOpen = (): void => {
      peer.off("error", onError);
      resolve(peer);
    };
    const onError = (err: Error): void => {
      peer.off("open", onOpen);
      reject(err);
    };
    peer.once("open", onOpen);
    peer.once("error", onError);
    setTimeout(() => {
      peer.off("open", onOpen);
      peer.off("error", onError);
      reject(new Error("Peer registration timed out (15s)"));
    }, 15000);
  });
}

/**
 * Create an anonymous Peer (the broker assigns an id). Used by the
 * publisher (phone) side which doesn't need a stable id.
 */
export async function createAnonymousPeer(
  options?: Partial<PeerOptions>,
): Promise<PeerType> {
  const Peer = await loadPeer();
  const peer = new Peer({ ...defaultPeerOptions(), ...options });
  return new Promise<PeerType>((resolve, reject) => {
    const onOpen = (): void => {
      peer.off("error", onError);
      resolve(peer);
    };
    const onError = (err: Error): void => {
      peer.off("open", onOpen);
      reject(err);
    };
    peer.once("open", onOpen);
    peer.once("error", onError);
    setTimeout(() => {
      peer.off("open", onOpen);
      peer.off("error", onError);
      reject(new Error("Peer registration timed out (15s)"));
    }, 15000);
  });
}

export interface PublishUrlOptions {
  /** Origin used to build the publish URL. Falls back to window.location.origin. */
  origin?: string;
}

export function buildPublishUrl(
  peerId: string,
  opts: PublishUrlOptions = {},
): string {
  const base =
    opts.origin ??
    (typeof window !== "undefined" ? window.location.origin : "");
  return `${base}/publish/${encodeURIComponent(peerId)}`;
}
