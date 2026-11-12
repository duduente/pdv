import { useEffect, useState } from 'react';
import { FileText, Image } from 'lucide-react';
import { getSupportAttachmentUrl, type SupportAttachment } from '@/lib/supportChat';
import { toast } from 'sonner';

export function SupportAttachmentLink({ attachment, isDemo }: {
  attachment: SupportAttachment;
  isDemo: boolean;
}) {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void getSupportAttachmentUrl({
      isDemo,
      attachment: { name: attachment.name, mimeType: attachment.mimeType, path: attachment.path },
    })
      .then((signedUrl) => { if (active) setUrl(signedUrl); })
      .catch((error: unknown) => {
        toast.error(error instanceof Error ? error.message : 'Não foi possível abrir o anexo.');
      });
    return () => { active = false; };
  }, [attachment.name, attachment.mimeType, attachment.path, isDemo]);

  useEffect(() => () => {
    if (url?.startsWith('blob:')) URL.revokeObjectURL(url);
  }, [url]);

  if (!url) return <p className="mt-2 text-xs text-muted-foreground">Carregando anexo...</p>;
  const FileIcon = attachment.mimeType === 'application/pdf' ? FileText : Image;
  return (
    <a href={url} target="_blank" rel="noreferrer" className="mt-2 flex items-center gap-2 text-xs font-medium underline">
      <FileIcon className="h-4 w-4 shrink-0" />
      <span className="truncate">{attachment.name}</span>
    </a>
  );
}
