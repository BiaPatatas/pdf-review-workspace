import { useEffect, useRef, useState } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import 'pdfjs-dist/web/pdf_viewer.css';

pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;

interface PdfViewerProps {
  fileUrl: string;
  pageNumber: number;
  scale?: number;
  onNumPagesLoaded?: (numPages: number) => void;
  onTextSelected: (selectedText: string, page: number) => void;
}

export function PdfViewer({
  fileUrl,
  pageNumber,
  scale = 1.0,
  onNumPagesLoaded,
  onTextSelected,
}: PdfViewerProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const textLayerRef = useRef<HTMLDivElement | null>(null);
  const [pdfDoc, setPdfDoc] = useState<PDFDocumentProxy | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Effect 1: Load PDF document once per fileUrl and clean up on unmount
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setPdfDoc(null);

    const loadingTask = pdfjsLib.getDocument({ url: fileUrl });

    loadingTask.promise
      .then((doc) => {
        if (cancelled) return;
        setPdfDoc(doc);
        onNumPagesLoaded?.(doc.numPages);
      })
      .catch((err) => {
        if (cancelled) return;
        const message =
          err instanceof Error ? err.message : 'Failed to load PDF document.';
        if (!message.toLowerCase().includes('cancel')) {
          setError(message);
        }
        setLoading(false);
      });

    return () => {
      cancelled = true;
      loadingTask.destroy();
    };
  }, [fileUrl, onNumPagesLoaded]);

  // Effect 2: Render only the active page when pdfDoc, pageNumber, or scale changes
  useEffect(() => {
    if (!pdfDoc) return;

    let cancelled = false;
    let renderTask: pdfjsLib.RenderTask | null = null;
    let textLayerInstance: pdfjsLib.TextLayer | null = null;

    async function renderPage() {
      setLoading(true);
      setError(null);

      try {
        const page = await pdfDoc!.getPage(pageNumber);
        if (cancelled) return;

        const viewport = page.getViewport({ scale });
        const canvas = canvasRef.current;
        const textLayerDiv = textLayerRef.current;

        if (!canvas || !textLayerDiv) return;

        const context = canvas.getContext('2d');
        if (!context) return;

        const dpr = window.devicePixelRatio || 1;
        canvas.width = Math.floor(viewport.width * dpr);
        canvas.height = Math.floor(viewport.height * dpr);
        canvas.style.width = `${viewport.width}px`;
        canvas.style.height = `${viewport.height}px`;

        context.setTransform(dpr, 0, 0, dpr, 0, 0);

        renderTask = page.render({
          canvas,
          canvasContext: context,
          viewport,
        });
        await renderTask.promise;
        if (cancelled) return;

        // Render selectable textLayer on top of canvas (original PDF stays intact)
        textLayerDiv.innerHTML = '';
        textLayerDiv.style.width = `${viewport.width}px`;
        textLayerDiv.style.height = `${viewport.height}px`;
        textLayerDiv.style.setProperty('--scale-factor', String(viewport.scale));
        textLayerDiv.style.setProperty('--total-scale-factor', String(viewport.scale));

        const textContent = await page.getTextContent();
        if (cancelled) return;

        textLayerInstance = new pdfjsLib.TextLayer({
          textContentSource: textContent,
          container: textLayerDiv,
          viewport,
        });
        await textLayerInstance.render();
      } catch (err) {
        if (!cancelled) {
          const message =
            err instanceof Error ? err.message : 'Failed to render PDF page.';
          if (!message.toLowerCase().includes('cancel')) {
            setError(message);
          }
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    renderPage();

    return () => {
      cancelled = true;
      renderTask?.cancel();
      textLayerInstance?.cancel();
    };
  }, [pdfDoc, pageNumber, scale]);

  function handleMouseUp() {
    const selection = window.getSelection();
    const selectedText = selection?.toString().trim() ?? '';
    if (selectedText.length > 0) {
      onTextSelected(selectedText, pageNumber);
    }
  }

  return (
    <div className="pdf-viewer-shell" aria-label={`PDF Page ${pageNumber}`}>
      {loading && (
        <div className="pdf-status" role="status" aria-live="polite">
          Loading PDF page {pageNumber}...
        </div>
      )}
      {error && (
        <div className="pdf-error" role="alert">
          Error loading PDF: {error}
        </div>
      )}

      <div
        className="pdf-page-container"
        onMouseUp={handleMouseUp}
        onKeyUp={handleMouseUp}
      >
        <canvas ref={canvasRef} className="pdf-canvas" />
        <div ref={textLayerRef} className="textLayer pdf-text-layer" />
      </div>
    </div>
  );
}