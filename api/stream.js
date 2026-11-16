export default async function handler(req, res) {
  const { id } = req.query;

  if (!id) {
    return res.status(400).json({ error: 'ID do arquivo não informado' });
  }

  // Endpoint direto de CDN do Google Drive que evita a tela intermediária de vírus
  const driveUrl = `https://drive.usercontent.google.com/download?id=${id}&export=download&authuser=0&confirm=t`;

  try {
    const headers = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
    };

    if (req.headers.range) {
      headers['Range'] = req.headers.range;
    }

    const response = await fetch(driveUrl, {
      headers,
      redirect: 'follow'
    });

    if (!response.ok && response.status !== 206) {
      return res.status(response.status).send('Erro ao buscar mídia no Drive');
    }

    const contentType = response.headers.get('content-type') || 'video/mp4';

    // Se por acaso o Google ainda devolver HTML em vez de vídeo, extrai o link real do formulário
    if (contentType.includes('text/html')) {
      const html = await response.text();
      const uuidMatch = html.match(/name="uuid" value="([^"]+)"/);
      const confirmMatch = html.match(/name="confirm" value="([^"]+)"/);
      
      if (uuidMatch) {
        const confirmVal = confirmMatch ? confirmMatch[1] : 't';
        const bypassUrl = `https://drive.usercontent.google.com/download?id=${id}&export=download&confirm=${confirmVal}&uuid=${uuidMatch[1]}`;
        
        const retryResponse = await fetch(bypassUrl, { headers, redirect: 'follow' });
        return streamResponse(retryResponse, res);
      }
      return res.status(502).send('O Google Drive bloqueou o download direto deste arquivo.');
    }

    return streamResponse(response, res);

  } catch (error) {
    console.error('Erro no proxy:', error);
    res.status(500).send('Erro interno no servidor de mídia');
  }
}

async function streamResponse(response, res) {
  const contentType = response.headers.get('content-type') || 'application/octet-stream';
  const contentLength = response.headers.get('content-length');
  const contentRange = response.headers.get('content-range');
  const acceptRanges = response.headers.get('accept-ranges') || 'bytes';

  res.setHeader('Content-Type', contentType);
  res.setHeader('Cache-Control', 'public, max-age=3600');
  res.setHeader('Accept-Ranges', acceptRanges);
  if (contentLength) res.setHeader('Content-Length', contentLength);
  if (contentRange) res.setHeader('Content-Range', contentRange);

  res.status(response.status);

  const reader = response.body.getReader();
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    res.write(Buffer.from(value));
  }
  res.end();
}