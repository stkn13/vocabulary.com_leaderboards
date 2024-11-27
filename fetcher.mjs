import http from 'http';
import https from 'https';
import httpProxy from 'http-proxy';
import fetch from 'node-fetch';
import { getProxyForUrl } from 'proxy-from-env';
import { URL, URLSearchParams } from 'url';
import util from 'util';

const PORT = 5555;

// Configuration for the CORS Proxy
const proxy = httpProxy.createProxyServer({
  xfwd: true,
  secure: process.env.NODE_TLS_REJECT_UNAUTHORIZED !== '0',
});

// Error Handling for the Proxy
proxy.on('error', (err, req, res) => {
  if (res.headersSent) {
    res.end();
    return;
  }
  res.writeHead(500, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Proxy encountered an error.', details: err.message }));
});

async function authenticate() {
  const authUrl = 'https://api.vocabulary.com/1.0/auth/token';
  
  const headers = {
    'Accept': '*/*',
    'Accept-Language': 'en-GB,en-US;q=0.9,en;q=0.8',
    'Cache-Control': 'no-cache',
    'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
    'Pragma': 'no-cache',
    'Priority': 'u=1, i',
    'Sec-CH-UA': '"Google Chrome";v="131", "Chromium";v="131", "Not_A Brand";v="24"',
    'Sec-CH-UA-Mobile': '?0',
    'Sec-CH-UA-Platform': '"macOS"',
    'Sec-Fetch-Dest': 'empty',
    'Sec-Fetch-Mode': 'cors',
    'Sec-Fetch-Site': 'same-origin',
    'Referer': 'https://api.vocabulary.com/proxy.html',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
  };

  const body = new URLSearchParams({
    // Add necessary form fields here
    // username: 'your_username',
    // password: 'your_password',
  }).toString();

  try {
    const response = await fetch(authUrl, {
      method: 'POST',
      headers: headers,
      body: body,
    });

    if (!response.ok) {
      throw new Error(`Authentication failed with status ${response.status}`);
    }

    const data = await response.json();
    return data.access_token;
  } catch (error) {
    console.error('Error during authentication:', error.message);
    throw error;
  }
}

async function fetchLeaderboard(accessToken, topCount = 100) {
  const apiUrl = `https://api.vocabulary.com/1.0/leaderboards/individual/points?top=${topCount}`;

  const headers = {
    'Accept': 'application/json',
    'Accept-Language': 'en-GB,en-US;q=0.9,en;q=0.8',
    'Cache-Control': 'no-cache',
    'Pragma': 'no-cache',
    'Priority': 'u=1, i',
    'Sec-CH-UA': '"Google Chrome";v="131", "Chromium";v="131", "Not_A Brand";v="24"',
    'Sec-CH-UA-Mobile': '?0',
    'Sec-CH-UA-Platform': '"macOS"',
    'Sec-Fetch-Dest': 'empty',
    'Sec-Fetch-Mode': 'cors',
    'Sec-Fetch-Site': 'same-origin',
    'Referer': 'https://api.vocabulary.com/proxy.html',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Authorization': `Bearer ${accessToken}`,
  };

  try {
    const proxyUrl = getProxyForUrl(apiUrl);
    let finalUrl = apiUrl;

    if (proxyUrl) {
      finalUrl = proxyUrl;
      console.log(`Using proxy: ${proxyUrl}`);
    }

    const response = await fetch(finalUrl, {
      method: 'GET',
      headers: headers,
    });

    if (!response.ok) {
      throw new Error(`Fetching leaderboard failed with status ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    console.error('Error fetching leaderboard:', error.message);
    throw error;
  }
}

// Create HTTP server
const server = http.createServer(async (req, res) => {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // Handle OPTIONS request for CORS
  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  // Parse URL and query parameters
  const url = new URL(req.url, `http://${req.headers.host}`);
  const path = url.pathname;
  const topParam = url.searchParams.get('top');

  if (path === '/leaderboard') {
    try {
      const accessToken = await authenticate();
      // Convert topParam to number, default to 100 if not provided or invalid
      const topCount = topParam ? parseInt(topParam, 10) : 100;
      
      if (isNaN(topCount) || topCount < 1) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid top parameter. Must be a positive number.' }));
        return;
      }

      const leaderboard = await fetchLeaderboard(accessToken, topCount);
      
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(leaderboard, null, 2));
    } catch (error) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: error.message }));
    }
  } else {
    // Serve a simple HTML page for the root URL
    if (path === '/') {
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(`
        <!DOCTYPE html>
        <html>
        <head>
          <title>Vocabulary.com Leaderboard API</title>
          <style>
            body { font-family: Arial, sans-serif; margin: 40px; }
            pre { background: #f4f4f4; padding: 20px; border-radius: 5px; }
            .form-group { margin-bottom: 20px; }
            button { padding: 10px 20px; }
          </style>
        </head>
        <body>
          <h1>Vocabulary.com Leaderboard API</h1>
          <div class="form-group">
            <label for="topCount">Number of entries:</label>
            <input type="number" id="topCount" value="100" min="1">
            <button onclick="fetchLeaderboard()">Fetch Leaderboard</button>
          </div>
          <p>Example: <a href="/leaderboard?top=10">/leaderboard?top=10</a></p>
          <div id="result"></div>
          <script>
            function fetchLeaderboard() {
              const topCount = document.getElementById('topCount').value;
              document.getElementById('result').innerHTML = 'Loading...';
              
              fetch('/leaderboard?top=' + topCount)
                .then(response => response.json())
                .then(data => {
                  document.getElementById('result').innerHTML = 
                    '<pre>' + JSON.stringify(data, null, 2) + '</pre>';
                })
                .catch(error => {
                  document.getElementById('result').innerHTML = 
                    '<pre>Error: ' + error.message + '</pre>';
                });
            }
            
            // Initial fetch
            fetchLeaderboard();
          </script>
        </body>
        </html>
      `);
      return;
    }

    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not Found' }));
  }
});

// Start the server
server.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}/`);
  console.log(`Access the leaderboard at http://localhost:${PORT}/leaderboard?top=100`);
});