import { splitInlineUrls } from '@/lib/link-preview';

export function ResponseText({ text }: { text: string }) {
  const parts = splitInlineUrls(text);
  return (
    <>
      {parts.map((part, i) => {
        if (!/^https?:\/\//i.test(part)) {
          return <span key={`${i}-${part.slice(0, 12)}`}>{part}</span>;
        }
        return (
          <a
            key={`${i}-url`}
            href={part}
            target="_blank"
            rel="noopener noreferrer"
            className="break-all text-primary underline"
          >
            {part}
          </a>
        );
      })}
    </>
  );
}
