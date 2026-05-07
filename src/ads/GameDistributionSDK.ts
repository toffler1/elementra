import { getOrCreateSoundManager } from '../fx/SoundManager';

declare const gdsdk: {
  AdType: { Interstitial: string; Rewarded: string };
  showAd: (type?: string) => Promise<void>;
};

export function initGameDistributionSDK(): void {
  const sfx = getOrCreateSoundManager();
  // Wire GD_OPTIONS events (set in index.html) to SoundManager
  (window as any).__gdPause  = () => sfx.forceMute(true);
  (window as any).__gdResume = () => sfx.forceMute(false);
}

export function gdIsAvailable(): boolean {
  return typeof gdsdk !== 'undefined' && typeof gdsdk.showAd === 'function';
}

export function gdRequestMidgameAd(callbacks: {
  adStarted?:  () => void;
  adFinished?: () => void;
  adError?:    () => void;
}): void {
  if (!gdIsAvailable()) {
    callbacks.adFinished?.();
    return;
  }
  try {
    callbacks.adStarted?.();
    gdsdk.showAd(gdsdk.AdType.Interstitial)
      .then(() => callbacks.adFinished?.())
      .catch(() => { callbacks.adError?.(); callbacks.adFinished?.(); });
  } catch {
    callbacks.adFinished?.();
  }
}
