/** Cookie prefs for the app sidebar — read on the server so first paint matches. */

export const SIDEBAR_STATE_COOKIE = 'sidebar_state';
export const SIDEBAR_WIDTH_COOKIE = 'sidebar_width';

export const SIDEBAR_MIN_WIDTH_PX = 224;
export const SIDEBAR_MAX_WIDTH_PX = 448;
export const SIDEBAR_DEFAULT_WIDTH_PX = 288;

export function clampSidebarWidth(px: number): number {
  return Math.min(SIDEBAR_MAX_WIDTH_PX, Math.max(SIDEBAR_MIN_WIDTH_PX, Math.round(px)));
}

type CookieReader = {
  get: (name: string) => { value: string } | undefined;
};

export function readSidebarPrefs(cookieStore: CookieReader): {
  defaultOpen: boolean;
  defaultWidth: number;
} {
  const state = cookieStore.get(SIDEBAR_STATE_COOKIE)?.value;
  const widthRaw = cookieStore.get(SIDEBAR_WIDTH_COOKIE)?.value;
  const parsedWidth = widthRaw ? Number.parseInt(widthRaw, 10) : NaN;

  return {
    // Cookie is written as "true" / "false". Missing → expanded.
    defaultOpen: state !== 'false',
    defaultWidth: Number.isFinite(parsedWidth)
      ? clampSidebarWidth(parsedWidth)
      : SIDEBAR_DEFAULT_WIDTH_PX,
  };
}
