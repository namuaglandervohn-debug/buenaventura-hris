import { useEffect, useRef, useState } from 'react';
import { Alert, Button, Dialog, DialogActions, DialogContent, DialogTitle } from './bootstrap';
import { cropSchedulePhoto, fullSchedulePhoto, type ScheduleCrop } from '../lib/scheduleImageCrop';

type Props = {
  file: File;
  busy: boolean;
  error: string;
  onClose: () => void;
  onRetry: (canvas: HTMLCanvasElement) => void;
};

const edges = [
  ['left', 'Left edge'], ['right', 'Right edge'], ['top', 'Top edge'], ['bottom', 'Bottom edge'],
] as const;

export default function ScheduleImageCropDialog({ file, busy, error, onClose, onRetry }: Props) {
  const imageRef = useRef<HTMLImageElement>(null);
  const [preview, setPreview] = useState('');
  const [loaded, setLoaded] = useState(false);
  const [crop, setCrop] = useState<ScheduleCrop>(fullSchedulePhoto);
  const [previewError, setPreviewError] = useState('');

  useEffect(() => {
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  function retry() {
    if (!imageRef.current?.naturalWidth) return;
    try {
      const canvas = cropSchedulePhoto(imageRef.current, crop);
      setPreviewError('');
      onRetry(canvas);
    } catch (err) {
      setPreviewError(err instanceof Error ? err.message : 'Could not crop this photo.');
    }
  }

  return (
    <Dialog open onClose={() => { if (!busy) onClose(); }} maxWidth="md" fullWidth>
      <DialogTitle>Crop the schedule photo</DialogTitle>
      <DialogContent>
        <p>Move the four edges to keep the week, employee names, weekday headings, and all shifts inside the crop.</p>
        {error || previewError ? <Alert severity="warning">{previewError || error}</Alert> : null}
        {preview && (
          <div style={{ position: 'relative', width: 'fit-content', maxWidth: '100%', margin: '0 auto' }}>
            <img
              ref={imageRef}
              src={preview}
              alt="Uploaded employee schedule"
              style={{ display: 'block', maxWidth: '100%', maxHeight: '48vh' }}
              onLoad={() => setLoaded(true)}
              onError={() => setPreviewError('This photo cannot be previewed. Try uploading it as a JPG or PNG.')}
            />
            {loaded && (
              <div aria-hidden="true" style={{
                position: 'absolute', pointerEvents: 'none', border: '2px solid #197a49',
                left: `${crop.left * 100}%`, right: `${(1 - crop.right) * 100}%`,
                top: `${crop.top * 100}%`, bottom: `${(1 - crop.bottom) * 100}%`,
                boxShadow: '0 0 0 1px white',
              }} />
            )}
          </div>
        )}
        <fieldset disabled={!loaded || busy} className="row g-2 mt-2">
          <legend className="visually-hidden">Crop edges</legend>
          {edges.map(([edge, label]) => {
            const minimum = edge === 'right' ? crop.left + .1 : edge === 'bottom' ? crop.top + .1 : 0;
            const maximum = edge === 'left' ? crop.right - .1 : edge === 'top' ? crop.bottom - .1 : 1;
            return (
              <label key={edge} className="col-6">
                {label}
                <input
                  className="form-range"
                  type="range"
                  min={Math.round(minimum * 100)}
                  max={Math.round(maximum * 100)}
                  value={Math.round(crop[edge] * 100)}
                  onChange={event => {
                    const value = Number(event.target.value) / 100;
                    setCrop(region => ({ ...region, [edge]: value }));
                  }}
                />
              </label>
            );
          })}
        </fieldset>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={busy}>Cancel</Button>
        <Button variant="contained" onClick={retry} disabled={!loaded || busy}>
          {busy ? 'Reading schedule…' : 'Read cropped photo'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
