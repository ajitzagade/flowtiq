'use client';

// AudioContext must be resumed after a user gesture — browsers block autoplay otherwise.
// We unlock it on the first user interaction, then reuse for all notification sounds.
let ctx: AudioContext | null = null;
let buffer: AudioBuffer | null = null;
let unlocked = false;

async function getContext(): Promise<AudioContext | null> {
  if (typeof window === 'undefined') return null;
  if (!ctx) ctx = new AudioContext();
  if (ctx.state === 'suspended') await ctx.resume();
  return ctx;
}

async function loadBuffer(): Promise<AudioBuffer | null> {
  if (buffer) return buffer;
  const context = await getContext();
  if (!context) return null;
  try {
    const res = await fetch('/flowtiq_sound.mp3');
    const arrayBuffer = await res.arrayBuffer();
    buffer = await context.decodeAudioData(arrayBuffer);
    return buffer;
  } catch {
    return null;
  }
}

// Call this once on first user interaction (click/keydown) to pre-unlock audio
export async function unlockAudio(): Promise<void> {
  if (unlocked) return;
  const context = await getContext();
  if (!context) return;
  // Play a silent buffer to unlock audio context
  const silent = context.createBuffer(1, 1, 22050);
  const source = context.createBufferSource();
  source.buffer = silent;
  source.connect(context.destination);
  source.start();
  await loadBuffer();
  unlocked = true;
}

export async function playNotificationSound(): Promise<void> {
  try {
    const context = await getContext();
    if (!context) return;
    const buf = await loadBuffer();
    if (!buf) return;
    const source = context.createBufferSource();
    source.buffer = buf;
    source.connect(context.destination);
    source.start();
  } catch {
    // Fallback to Audio element
    new Audio('/flowtiq_sound.mp3').play().catch(() => {});
  }
}
