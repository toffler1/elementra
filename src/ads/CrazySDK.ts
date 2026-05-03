type CrazySDKType = {
  init: () => Promise<void>;
  ad: {
    requestAd: (type: 'midgame' | 'rewarded', callbacks: {
      adStarted?:  () => void;
      adFinished?: () => void;
      adError?:    (error: unknown) => void;
    }) => void;
  };
  game: {
    gameplayStart: () => void;
    gameplayStop:  () => void;
    loadingStop:   () => void;
  };
};

function getSDK(): CrazySDKType | null {
  return (window as any).CrazyGames?.SDK ?? null;
}

let ready = false;

export async function initCrazySDK(): Promise<void> {
  try {
    const sdk = getSDK();
    if (!sdk) return;
    await sdk.init();
    sdk.game.loadingStop();
    ready = true;
  } catch {
    // not on CrazyGames platform — silently degrade
  }
}

export function gameplayStart(): void {
  if (!ready) return;
  try { getSDK()?.game.gameplayStart(); } catch {}
}

export function gameplayStop(): void {
  if (!ready) return;
  try { getSDK()?.game.gameplayStop(); } catch {}
}

export function requestMidgameAd(callbacks: {
  adStarted?:  () => void;
  adFinished?: () => void;
  adError?:    () => void;
}): void {
  if (!ready) {
    callbacks.adFinished?.();
    return;
  }
  try {
    getSDK()?.ad.requestAd('midgame', {
      adStarted:  callbacks.adStarted,
      adFinished: callbacks.adFinished,
      adError:    () => { callbacks.adError?.() ?? callbacks.adFinished?.(); },
    });
  } catch {
    callbacks.adFinished?.();
  }
}
