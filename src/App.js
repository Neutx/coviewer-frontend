import React, { useEffect, useState } from 'react';
import * as pdfjsLib from 'pdfjs-dist/build/pdf';
import pdfjsWorker from 'pdfjs-dist/build/pdf.worker.entry';
import io from 'socket.io-client';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker;

const socket = io('http://localhost:3000', {
  withCredentials: true,
  transports: ['websocket']
});

const PdfViewer = ({ currentPage, pdfData }) => {
  const [error, setError] = useState(null);
  const [totalPages, setTotalPages] = useState(1);
  const [canvasKey, setCanvasKey] = useState(0);

  const renderPage = async (canvas, pageNum, pdfData) => {
    try {
      const context = canvas.getContext('2d');
      context.clearRect(0, 0, canvas.width, canvas.height);

      const pdfBytes = new Uint8Array(pdfData.split(',').map(Number));
      const loadingTask = pdfjsLib.getDocument({ data: pdfBytes });
      const pdf = await loadingTask.promise;
      
      setTotalPages(pdf.numPages);
      const page = await pdf.getPage(pageNum);
      const viewport = page.getViewport({ scale: 1.5 });

      canvas.height = viewport.height;
      canvas.width = viewport.width;

      await page.render({
        canvasContext: context,
        viewport: viewport
      }).promise;

    } catch (error) {
      console.error('Error rendering PDF:', error);
      setError(error.message);
    }
  };

  useEffect(() => {
    if (!pdfData) return;

    setCanvasKey(prev => prev + 1);
  }, [pdfData, currentPage]);

  useEffect(() => {
    const canvas = document.getElementById('pdf-canvas');
    if (canvas && pdfData) {
      renderPage(canvas, currentPage, pdfData);
    }
  }, [canvasKey]);

  return (
    <div>
      {error && <div style={{color: 'red'}}>{error}</div>}
      <canvas
        id="pdf-canvas"
        key={canvasKey}
        style={{
          border: '1px solid black',
          maxWidth: '100%',
          height: 'auto'
        }}
      />
      {totalPages > 1 && (
        <div style={{textAlign: 'center', marginTop: '10px'}}>
          Page {currentPage} of {totalPages}
        </div>
      )}
    </div>
  );
};

function App() {
  const [currentPage, setCurrentPage] = useState(1);
  const [pdfData, setPdfData] = useState(null);
  const [isConnected, setIsConnected] = useState(false);
  const [users, setUsers] = useState(0);
  const [isAdmin, setIsAdmin] = useState(false);
  const [username, setUsername] = useState('');
  const [isLoggedIn, setIsLoggedIn] = useState(false);

  const handleFileChange = async (event) => {
    if (!isAdmin) {
      alert('Only admins can change the PDF file');
      return;
    }

    const file = event.target.files[0];
    if (file && file.type === 'application/pdf') {
      try {
        setPdfData(null);
        setCurrentPage(1);

        const arrayBuffer = await file.arrayBuffer();
        const uint8Array = new Uint8Array(arrayBuffer);
        const pdfString = Array.from(uint8Array).toString();

        setTimeout(() => {
          setPdfData(pdfString);
          socket.emit('uploadPdf', {
            pdfData: pdfString,
            username
          });
        }, 100);

      } catch (error) {
        console.error('Error processing PDF:', error);
        alert('Error processing PDF file');
      }
    } else {
      alert('Please select a valid PDF file');
    }
  };

  useEffect(() => {
    socket.on('connect', () => {
      setIsConnected(true);
      console.log('Connected to server');
      socket.emit('requestPdfState');
    });

    socket.on('pdfUpdate', (data) => {
      console.log('Received PDF update');
      setPdfData(null);
      setTimeout(() => {
        setPdfData(data);
        setCurrentPage(1);
      }, 100);
    });

    socket.on('currentPdfState', (data) => {
      console.log('Received current PDF state');
      if (data && data.pdfData) {
        setPdfData(null);
        setTimeout(() => {
          setPdfData(data.pdfData);
          setCurrentPage(data.currentPage || 1);
        }, 100);
      }
    });

    socket.on('pageUpdate', (data) => {
      console.log(`Page changed to ${data.page} by ${data.username}`);
      setCurrentPage(data.page);
    });

    socket.on('userCount', (count) => {
      setUsers(count);
    });

    return () => {
      socket.off('connect');
      socket.off('disconnect');
      socket.off('pageUpdate');
      socket.off('pdfUpdate');
      socket.off('currentPdfState');
      socket.off('userCount');
    };
  }, []);

  const handleLogin = (e) => {
    e.preventDefault();
    if (username.trim()) {
      const isAdminUser = username.toLowerCase() === 'admin';
      setIsAdmin(isAdminUser);
      socket.emit('login', { 
        username, 
        role: isAdminUser ? 'admin' : 'viewer' 
      });
      setIsLoggedIn(true);
      console.log(`Logged in as ${username} (${isAdminUser ? 'admin' : 'viewer'})`);
    }
  };

  const changePage = (newPage) => {
    if (isAdmin && newPage > 0) {
      setPdfData(prev => {
        socket.emit('changePage', { page: newPage, username });
        setCurrentPage(newPage);
        return prev;
      });
    }
  };

  if (!isLoggedIn) {
    return (
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'center',
        height: '100vh'
      }}>
        <h2>PDF Co-Viewer Login</h2>
        <p>Enter 'admin' for admin access or any other name for viewer access</p>
        <form onSubmit={handleLogin} style={{marginTop: '20px'}}>
          <input
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="Enter username"
            required
            style={{padding: '5px', marginRight: '10px'}}
          />
          <button type="submit" style={{padding: '5px 10px'}}>Join Session</button>
        </form>
      </div>
    );
  }

  return (
    <div className="App" style={{padding: '20px'}}>
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '20px'
      }}>
        <h1>PDF Co-Viewer</h1>
        <div>
          <span style={{
            color: isConnected ? 'green' : 'red',
            marginRight: '10px'
          }}>
            ● {isConnected ? 'Connected' : 'Disconnected'}
          </span>
          <span style={{marginRight: '10px'}}>Users: {users}</span>
          <span>Role: {isAdmin ? 'Admin' : 'Viewer'}</span>
        </div>
      </div>

      <div style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '10px'
      }}>
        {isAdmin && (
          <input 
            type="file" 
            accept=".pdf" 
            onChange={handleFileChange}
            style={{marginBottom: '20px'}}
          />
        )}

        {pdfData ? (
          <>
            <PdfViewer currentPage={currentPage} pdfData={pdfData} />
            <div style={{marginTop: '10px'}}>
              {isAdmin ? (
                <>
                  <button 
                    onClick={() => changePage(currentPage - 1)}
                    disabled={currentPage <= 1}
                    style={{marginRight: '10px'}}
                  >
                    Previous
                  </button>
                  <button 
                    onClick={() => changePage(currentPage + 1)}
                  >
                    Next
                  </button>
                </>
              ) : (
                <p>Viewing mode: Page changes are controlled by the admin</p>
              )}
            </div>
          </>
        ) : (
          <p>{isAdmin ? 'Please select a PDF file to view' : 'Waiting for admin to load a PDF...'}</p>
        )}
      </div>
    </div>
  );
}

export default App;
