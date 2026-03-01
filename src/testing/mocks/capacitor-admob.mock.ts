import { vi } from 'vitest';

export const AdMob = {
  initialize: vi.fn().mockResolvedValue(undefined),
  setApplicationMuted: vi.fn().mockResolvedValue(undefined),
  setApplicationVolume: vi.fn().mockResolvedValue(undefined),
  addListener: vi.fn().mockResolvedValue(undefined),
  prepareInterstitial: vi.fn().mockResolvedValue(undefined),
  showInterstitial: vi.fn().mockResolvedValue(undefined),
  requestConsentInfo: vi.fn().mockResolvedValue({}),
  showConsentForm: vi.fn().mockResolvedValue({}),
  resetConsentInfo: vi.fn().mockResolvedValue(undefined),
  trackingAuthorizationStatus: vi.fn().mockResolvedValue({}),
  prepareRewardVideoAd: vi.fn().mockResolvedValue(undefined),
  showRewardVideoAd: vi.fn().mockResolvedValue({}),
  removeBannerAd: vi.fn().mockResolvedValue(undefined),
  showBannerAd: vi.fn().mockResolvedValue(undefined),
  hideBanner: vi.fn().mockResolvedValue(undefined),
  resumeBanner: vi.fn().mockResolvedValue(undefined),
  destroyBanner: vi.fn().mockResolvedValue(undefined),
  updateBannerPosition: vi.fn().mockResolvedValue(undefined),
};

export const InterstitialAdPluginEvents = {
  Loaded: 'interstitialAdLoaded',
  FailedToLoad: 'interstitialAdFailedToLoad',
  Showed: 'interstitialAdShowed',
  FailedToShow: 'interstitialAdFailedToShow',
  Dismissed: 'interstitialAdDismissed',
};
