import { AttachedFileItem } from '../types/ecc';

const MAX_INLINE_MEDIA_BYTES = 18 * 1024 * 1024; // 18 MB
const MAX_TEXT_BYTES = 512 * 1024; // 512 KB per text/code file

const TEXT_EXTENSIONS = new Set([
  'ts',
  'tsx',
  'js',
  'jsx',
  'mjs',
  'cjs',
  'json',
  'md',
  'mdx',
  'txt',
  'css',
  'scss',
  'html',
  'htm',
  'xml',
  'svg',
  'yaml',
  'yml',
  'toml',
  'ini',
  'env',
  'sh',
  'bash',
  'py',
  'go',
  'rs',
  'java',
  'kt',
  'swift',
  'c',
  'cpp',
  'h',
  'hpp',
  'cs',
  'rb',
  'php',
  'sql',
  'csv',
  'log',
  'prisma',
  'graphql',
  'dockerfile',
]);

function detectKind(file: File): AttachedFileItem['kind'] {
  const mime = (file.type || '').toLowerCase();
  const ext = file.name.split('.').pop()?.toLowerCase() ?? '';

  if (mime.startsWith('image/')) return 'image';
  if (mime.startsWith('video/')) return 'video';
  if (mime.startsWith('audio/')) return 'audio';
  if (mime === 'application/pdf' || ext === 'pdf') return 'pdf';
  if (
    mime === 'application/zip' ||
    mime === 'application/x-zip-compressed' ||
    ext === 'zip'
  ) {
    return 'zip';
  }
  if (
    mime.startsWith('text/') ||
    mime === 'application/json' ||
    mime === 'application/javascript' ||
    mime === 'application/typescript' ||
    mime === 'application/xml' ||
    TEXT_EXTENSIONS.has(ext)
  ) {
    return 'text';
  }
  return 'binary';
}

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.onerror = () => reject(new Error(`Не удалось прочитать файл ${file.name}`));
    reader.readAsDataURL(file);
  });
}

function readAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.onerror = () => reject(new Error(`Не удалось прочитать текст ${file.name}`));
    reader.readAsText(file, 'utf-8');
  });
}

export async function processSelectedFiles(
  fileList: FileList | File[]
): Promise<{ items: AttachedFileItem[]; errors: string[] }> {
  const files = Array.from(fileList);
  const items: AttachedFileItem[] = [];
  const errors: string[] = [];

  for (const file of files) {
    const kind = detectKind(file);
    const id = `att-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

    if (kind === 'text') {
      if (file.size > MAX_TEXT_BYTES) {
        errors.push(`Текстовый файл «${file.name}» превышает 512 КБ.`);
        continue;
      }
      const textContent = await readAsText(file);
      items.push({
        id,
        name: file.name,
        mimeType: file.type || 'text/plain',
        size: file.size,
        kind,
        textContent,
      });
      continue;
    }

    if (file.size > MAX_INLINE_MEDIA_BYTES) {
      errors.push(`Файл «${file.name}» превышает лимит 18 МБ.`);
      continue;
    }

    const dataUrl = await readAsDataUrl(file);
    const base64Data = dataUrl.includes(',') ? dataUrl.split(',')[1] : '';
    const mimeType =
      file.type ||
      (kind === 'zip'
        ? 'application/zip'
        : kind === 'pdf'
        ? 'application/pdf'
        : 'application/octet-stream');

    items.push({
      id,
      name: file.name,
      mimeType,
      size: file.size,
      kind,
      base64Data,
      previewUrl: kind === 'image' ? dataUrl : undefined,
    });
  }

  return { items, errors };
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} Б`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} КБ`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} МБ`;
}
