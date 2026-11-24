import { useRef, useState } from 'react';
import {
  Box, Typography, Button, Chip, IconButton, Stack, LinearProgress, TextField, type ButtonProps,
} from './bootstrap';
import {
  UploadFile, InsertDriveFile, PictureAsPdf, Image as ImageIcon,
  Article, Close, CloudUpload, TaskAlt,
} from './bootstrap/icons';

interface FileUploadFieldProps {
  label: string;
  accept: string;
  multiple?: boolean;
  files: File[];
  onChange: (files: File[]) => void;
  helperText?: string;
  maxSizeMB?: number;
  browseButtonSx?: ButtonProps['sx'];
  browseFileLabel?: string;
  getFileTitle?: (file: File) => string;
  onFileTitleChange?: (file: File, title: string) => void;
}

function getFileIcon(file: File) {
  const type = file.type;
  if (type === 'application/pdf') return <PictureAsPdf fontSize="small" sx={{ color: '#E53935' }} />;
  if (type.startsWith('image/')) return <ImageIcon fontSize="small" sx={{ color: '#1E88E5' }} />;
  if (type.includes('word') || file.name.endsWith('.doc') || file.name.endsWith('.docx'))
    return <Article fontSize="small" sx={{ color: '#1565C0' }} />;
  return <InsertDriveFile fontSize="small" sx={{ color: '#546E7A' }} />;
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function FileUploadField({
  label,
  accept,
  multiple = false,
  files,
  onChange,
  helperText,
  maxSizeMB = 10,
  browseButtonSx,
  browseFileLabel = 'Documents',
  getFileTitle,
  onFileTitleChange,
}: FileUploadFieldProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState('');

  const maxBytes = maxSizeMB * 1024 * 1024;

  const processFiles = (incoming: FileList | File[]) => {
    setError('');
    const arr = Array.from(incoming);
    const acceptedTypes = accept.toLowerCase().split(',').map(type => type.trim()).filter(Boolean);
    const unsupported = arr.filter(file => file.size === 0 || (acceptedTypes.length > 0 && !acceptedTypes.some(type =>
      type.startsWith('.') ? file.name.toLowerCase().endsWith(type)
        : type.endsWith('/*') ? file.type.startsWith(type.slice(0, -1)) : file.type === type
    )));
    if (unsupported.length) {
      setError(`Select nonempty files in a supported format. Check ${unsupported.map(file => file.name).join(', ')}.`);
      return;
    }
    const oversized = arr.filter(f => f.size > maxBytes);
    if (oversized.length) {
      setError(`${oversized.map(f => f.name).join(', ')} exceed${oversized.length === 1 ? 's' : ''} the ${maxSizeMB} MB limit.`);
      return;
    }
    if (multiple) {
      // Deduplicate by name+size
      const existing = new Set(files.map(f => `${f.name}-${f.size}`));
      const newFiles = arr.filter(f => !existing.has(`${f.name}-${f.size}`));
      onChange([...files, ...newFiles]);
    } else {
      onChange([arr[0]]);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      processFiles(e.target.files);
    }
    // Reset so same file can be re-selected
    e.target.value = '';
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    if (e.dataTransfer.files.length > 0) processFiles(e.dataTransfer.files);
  };

  const removeFile = (index: number) => {
    onChange(files.filter((_, i) => i !== index));
  };

  const hasFiles = files.length > 0;

  return (
    <Box>
      {/* Drop zone */}
      <Box
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        onClick={browseButtonSx ? undefined : () => inputRef.current?.click()}
        sx={{
          border: `2px dashed`,
          borderColor: dragging
            ? 'primary.main'
            : hasFiles
            ? 'success.main'
            : error
            ? 'error.main'
            : 'rgba(31,122,71,0.30)',
          borderRadius: 'var(--hris-field-radius)',
          p: 2.5,
          textAlign: 'center',
          cursor: browseButtonSx ? undefined : 'pointer',
          bgcolor: dragging
            ? 'rgba(31,122,71,0.06)'
            : hasFiles
            ? 'rgba(46,139,87,0.04)'
            : 'rgba(242,247,243,0.8)',
          transition: 'all 0.2s ease',
          '&:hover': {
            borderColor: 'primary.main',
            bgcolor: 'rgba(31,122,71,0.05)',
          },
        }}
      >
        <input
          ref={inputRef}
          type="file"
          accept={accept}
          multiple={multiple}
          hidden
          onChange={handleInputChange}
        />

        <Stack alignItems="center" spacing={1}>
          {hasFiles ? (
            <TaskAlt sx={{ fontSize: 36, color: 'success.main' }} />
          ) : (
            <CloudUpload sx={{ fontSize: 36, color: dragging ? 'primary.main' : 'rgba(31,122,71,0.45)' }} />
          )}

          <Typography sx={{ fontWeight: 600, fontSize: '0.9rem', color: hasFiles ? 'success.dark' : 'text.primary' }}>
            {hasFiles
              ? `${files.length} file${files.length > 1 ? 's' : ''} selected`
              : label}
          </Typography>

          <Typography variant="caption" color="text.secondary">
            {dragging
              ? 'Drop files here'
              : hasFiles
              ? 'Click or drag to add more'
              : browseButtonSx ? 'Drag & drop files here' : 'Click to browse or drag & drop'}
          </Typography>

          {browseButtonSx && (
            <Button type="button" fullWidth variant="contained" startIcon={<UploadFile />}
              onClick={() => inputRef.current?.click()} sx={browseButtonSx}>
              {hasFiles ? `Add ${browseFileLabel}` : `Select ${browseFileLabel}`}
            </Button>
          )}

          {helperText && !hasFiles && (
            <Typography variant="caption" sx={{ color: 'text.disabled' }}>
              {helperText}
            </Typography>
          )}
        </Stack>
      </Box>

      {/* Error */}
      {error && (
        <Typography variant="caption" color="error" sx={{ mt: 0.5, display: 'block' }}>
          {error}
        </Typography>
      )}

      {/* File list */}
      {hasFiles && (
        <Stack spacing={0.75} sx={{ mt: 1.5 }}>
          {files.map((file, i) => (
            <Box
              key={`${file.name}-${file.size}-${i}`}
              sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 1,
                p: '8px 12px',
                borderRadius: 2,
                bgcolor: 'rgba(31,122,71,0.06)',
                border: '1px solid rgba(31,122,71,0.14)',
              }}
            >
              {getFileIcon(file)}
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Typography
                  sx={{ fontSize: '0.82rem', fontWeight: 600, color: 'text.primary', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                >
                  {file.name}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  {formatBytes(file.size)}
                </Typography>
                {onFileTitleChange && <TextField size="small" fullWidth required label="Document title" placeholder="e.g. Birth Certificate"
                  value={getFileTitle?.(file) ?? ''} onChange={event => onFileTitleChange(file, event.target.value)} sx={{ mt: 1 }} />}
              </Box>
              <Chip
                label={file.name.split('.').pop()?.toUpperCase() ?? 'FILE'}
                size="small"
                sx={{ fontSize: '0.68rem', height: 20, bgcolor: 'rgba(31,122,71,0.10)', color: 'primary.dark' }}
              />
              <IconButton
                size="small"
                onClick={(e) => { e.stopPropagation(); removeFile(i); }}
                sx={{ color: 'text.disabled', '&:hover': { color: 'error.main' }, ml: 0.5 }}
              >
                <Close fontSize="small" />
              </IconButton>
            </Box>
          ))}
        </Stack>
      )}
    </Box>
  );
}
