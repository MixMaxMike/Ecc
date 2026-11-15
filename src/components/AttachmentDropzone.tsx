import {
  FileArchive,
  FileCode2,
  FileText,
  Film,
  Image as ImageIcon,
  Music,
  Paperclip,
  X,
} from 'lucide-react';
import { useRef } from 'react';
import { AttachedFileItem } from '../types/ecc';
import { formatBytes, processSelectedFiles } from '../utils/fileAttachments';

interface AttachmentBarProps {
  attachments: AttachedFileItem[];
  onAddAttachments: (items: AttachedFileItem[]) => void;
  onRemoveAttachment: (id: string) => void;
  onError?: (msg: string) => void;
  onZipDetected?: (zipItem: AttachedFileItem) => void;
  compact?: boolean;
}

function AttachmentIcon({ kind }: { kind: AttachedFileItem['kind'] }) {
  switch (kind) {
    case 'image':
      return <ImageIcon className="h-3.5 w-3.5 shrink-0 text-blue-600 dark:text-blue-400" />;
    case 'video':
      return <Film className="h-3.5 w-3.5 shrink-0 text-violet-600 dark:text-violet-400" />;
    case 'audio':
      return <Music className="h-3.5 w-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" />;
    case 'zip':
      return <FileArchive className="h-3.5 w-3.5 shrink-0 text-amber-600 dark:text-amber-400" />;
    case 'text':
      return <FileCode2 className="h-3.5 w-3.5 shrink-0 text-zinc-600 dark:text-slate-300" />;
    default:
      return <FileText className="h-3.5 w-3.5 shrink-0 text-zinc-500 dark:text-slate-400" />;
  }
}

export function AttachmentPickerButton({
  onAddAttachments,
  onError,
  onZipDetected,
  label = 'Прикрепить файлы',
}: {
  onAddAttachments: (items: AttachedFileItem[]) => void;
  onError?: (msg: string) => void;
  onZipDetected?: (zipItem: AttachedFileItem) => void;
  label?: string;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);

  const handleFiles = async (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;
    const { items, errors } = await processSelectedFiles(fileList);
    if (errors.length > 0) {
      onError?.(errors.join(' '));
    }
    if (items.length > 0) {
      onAddAttachments(items);
      const zipItem = items.find((i) => i.kind === 'zip');
      if (zipItem && onZipDetected) {
        onZipDetected(zipItem);
      }
    }
    if (inputRef.current) {
      inputRef.current.value = '';
    }
  };

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        multiple
        accept="*/*"
        onChange={(e) => handleFiles(e.target.files)}
        className="hidden"
      />
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-zinc-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-xs font-medium text-zinc-700 dark:text-slate-200 hover:bg-zinc-50 dark:hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0"
      >
        <Paperclip className="h-3.5 w-3.5" />
        <span>{label}</span>
      </button>
    </>
  );
}

export function AttachmentList({
  attachments,
  onRemoveAttachment,
  onUnpackZip,
}: {
  attachments: AttachedFileItem[];
  onRemoveAttachment: (id: string) => void;
  onUnpackZip?: (zipItem: AttachedFileItem) => void;
}) {
  if (attachments.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-2">
      {attachments.map((att) => (
        <div
          key={att.id}
          className="inline-flex items-center gap-2 px-2.5 py-1.5 rounded-lg border border-zinc-200 dark:border-slate-700 bg-zinc-50 dark:bg-slate-950 text-xs max-w-full"
        >
          {att.kind === 'image' && att.previewUrl ? (
            <img
              src={att.previewUrl}
              alt={att.name}
              className="h-6 w-6 rounded object-cover shrink-0"
            />
          ) : (
            <AttachmentIcon kind={att.kind} />
          )}
          <span className="truncate max-w-[160px] font-medium text-zinc-800 dark:text-slate-200">
            {att.name}
          </span>
          <span className="font-mono text-[11px] text-zinc-400 dark:text-slate-500 tabular-nums shrink-0">
            {formatBytes(att.size)}
          </span>
          {att.kind === 'zip' && onUnpackZip && (
            <button
              type="button"
              onClick={() => onUnpackZip(att)}
              className="text-[11px] font-medium text-blue-600 dark:text-blue-400 hover:underline whitespace-nowrap"
            >
              В песочницу
            </button>
          )}
          <button
            type="button"
            onClick={() => onRemoveAttachment(att.id)}
            className="text-zinc-400 hover:text-red-600 dark:text-slate-500 dark:hover:text-red-400 shrink-0"
            aria-label={`Удалить ${att.name}`}
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      ))}
    </div>
  );
}

export function AttachmentDropHelper({
  attachments,
  onAddAttachments,
  onRemoveAttachment,
  onError,
  onZipDetected,
}: AttachmentBarProps) {
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <AttachmentPickerButton
          onAddAttachments={onAddAttachments}
          onError={onError}
          onZipDetected={onZipDetected}
          label="Прикрепить файлы (фото, видео, аудио, PDF, код, ZIP)"
        />
        <span className="text-[11px] text-zinc-400 dark:text-slate-500">
          Можно перетащить файлы или вставить скриншот (Ctrl+V)
        </span>
      </div>
      <AttachmentList
        attachments={attachments}
        onRemoveAttachment={onRemoveAttachment}
        onUnpackZip={onZipDetected}
      />
    </div>
  );
}
