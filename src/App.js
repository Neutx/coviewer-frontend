import React, { useEffect, useRef, useState } from 'react';
import * as pdfjsLib from 'pdfjs-dist/build/pdf';
import pdfjsWorker from 'pdfjs-dist/build/pdf.worker.entry';
import io from 'socket.io-client';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker;

const socket = io('http://localhost:3000'); // Connect to the backend

const PdfViewer = ({ currentPage }) => {
  const canvasRef = useRef();

  useEffect(() => {
    const loadPdf = async () => {
      const pdf = await pdfjsLib.getDocument('/path/to/your.pdf').promise;
      const page = await pdf.getPage(currentPage);
      const canvas = canvasRef.current;
      const context = canvas.getContext('2d');
      const viewport = page.getViewport({ scale: 1.5 });

      canvas.height = viewport.height;
      canvas.width = viewport.width;

      page.render({
        canvasContext: context,
        viewport: viewport
      });
    };

    loadPdf();
  }, [currentPage]);

  return <canvas ref={canvasRef}></canvas>;
};

function App() {
  const [currentPage, setCurrentPage] = useState(1);

  useEffect(() => {
    socket.on('pageUpdate', (page) => {
      setCurrentPage(page);
    });
  }, []);

  const changePage = (newPage) => {
    socket.emit('changePage', newPage);
  };

  return (
    <div className="App">
      <h1>PDF Co-Viewer</h1>
      <PdfViewer currentPage={currentPage} />
      <button onClick={() => changePage(currentPage - 1)}>Previous</button>
      <button onClick={() => changePage(currentPage + 1)}>Next</button>
    </div>
  );
}

export default App;
