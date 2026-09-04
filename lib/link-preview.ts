/** Resolve applicant-submitted URLs into something we can show in-app. */

export type LinkPreviewKind = 'iframe' | 'image' | 'external';

/** How opening this link in Google/Drive would reveal identity. */
export type IdentityLeakKind = 'filename' | 'folder-listing';

export type LinkPreview = {
  kind: LinkPreviewKind;
  /** Canonical URL to open (the first http(s) URL in the submitted text). */
  originalUrl: string;
  /** URL to load in an iframe or <img>, when kind is iframe/image. */
  embedUrl?: string;
  label: string;
  identityLeak?: IdentityLeakKind;
};

const LEADING_HTTP_URL = /^https?:\/\/[^\s]+/i;

export function firstHttpUrl(text: string): string | null {
  const match = text.trim().match(LEADING_HTTP_URL);
  return match?.[0] ?? null;
}

export function restAfterFirstUrl(text: string): string {
  const trimmed = text.trim();
  const url = firstHttpUrl(trimmed);
  if (!url) return trimmed;
  return trimmed.slice(url.length).replace(/^\s+/, '');
}

function parseFirstUrl(raw: string): URL | null {
  const trimmed = raw.trim();
  try {
    return new URL(trimmed);
  } catch {
    const first = firstHttpUrl(trimmed);
    if (!first) return null;
    try {
      return new URL(first);
    } catch {
      return null;
    }
  }
}

function hostnameOf(url: URL): string {
  return url.hostname.replace(/^www\./, '').toLowerCase();
}

/** Drive file/folder pages and Docs show titles that often include the applicant's name. */
export function isIdentityLeakingUrl(raw: string): boolean {
  const url = parseFirstUrl(raw);
  if (!url) return false;
  const host = hostnameOf(url);
  return host === 'drive.google.com' || host === 'docs.google.com';
}

export function splitInlineUrls(text: string): string[] {
  return text.split(/(https?:\/\/[^\s]+)/gi);
}

function driveFolderId(url: URL): string | null {
  const match = url.pathname.match(/\/folders\/([^/]+)/);
  return match?.[1] ?? null;
}

function driveFileId(url: URL): string | null {
  const fileMatch = url.pathname.match(/\/file\/d\/([^/]+)/);
  if (fileMatch?.[1]) return fileMatch[1];
  const openId = url.searchParams.get('id');
  if (openId) return openId;
  return null;
}

function googleWorkspaceEmbed(url: URL): string | null {
  const kinds = ['document', 'spreadsheets', 'presentation', 'forms'] as const;
  for (const kind of kinds) {
    const match = url.pathname.match(new RegExp(`/${kind}/d/([^/]+)`));
    if (match?.[1]) {
      return `https://docs.google.com/${kind}/d/${match[1]}/preview`;
    }
  }
  return null;
}

function looksLikeImage(pathname: string): boolean {
  return /\.(png|jpe?g|gif|webp|svg|avif)(\?|$)/i.test(pathname);
}

function looksLikePdf(pathname: string): boolean {
  return /\.pdf(\?|$)/i.test(pathname);
}

/**
 * Map a submitted link to an in-app preview strategy.
 * Falls back to external-only when we can't embed safely.
 */
export function resolveLinkPreview(raw: string): LinkPreview | null {
  const url = parseFirstUrl(raw);
  if (!url || (url.protocol !== 'http:' && url.protocol !== 'https:')) return null;

  const originalUrl = url.href;
  const host = hostnameOf(url);

  if (host === 'drive.google.com') {
    const folderId = driveFolderId(url);
    if (folderId) {
      return {
        kind: 'external',
        originalUrl,
        label: 'Google Drive folder',
        identityLeak: 'folder-listing',
      };
    }
    const id = driveFileId(url);
    if (id) {
      return {
        kind: 'iframe',
        originalUrl,
        embedUrl: `https://drive.google.com/file/d/${id}/preview`,
        label: 'Google Drive',
        identityLeak: 'filename',
      };
    }
  }

  if (host === 'docs.google.com') {
    const embed = googleWorkspaceEmbed(url);
    if (embed) {
      return {
        kind: 'iframe',
        originalUrl,
        embedUrl: embed,
        label: 'Google Doc',
        identityLeak: 'filename',
      };
    }
  }

  if (host === 'figma.com' || host.endsWith('.figma.com')) {
    const embedUrl = `https://www.figma.com/embed?embed_host=uma&url=${encodeURIComponent(originalUrl)}`;
    return {
      kind: 'iframe',
      originalUrl,
      embedUrl,
      label: 'Figma',
    };
  }

  if (looksLikeImage(url.pathname)) {
    return {
      kind: 'image',
      originalUrl,
      embedUrl: originalUrl,
      label: 'Image',
    };
  }

  if (looksLikePdf(url.pathname)) {
    return {
      kind: 'iframe',
      originalUrl,
      embedUrl: originalUrl,
      label: 'PDF',
    };
  }

  return {
    kind: 'external',
    originalUrl,
    label: 'Link',
  };
}
