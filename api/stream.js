export default async function handler(req, res) {
  const { id } = req.query;

  if (!id) {
    return res.status(400).json({ error: 'ID do arquivo não informado' });
  }

  const driveUrl = `https://drive.google.com/uc?export=download&confirm=t&id=${id}`;

  try {
    const headers = {};
    // Repassa o header Range para permitir streaming fluido de vídeos MP4
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

    // Repassa os cabeçalhos essenciais para o navegador entender que é um vídeo/imagem real
    const contentType = response.headers.get('content-type') || 'application/octet-stream';
    const contentLength = response.headers.get('content-length');
    const contentRange = response.headers.get('content-range');
    const acceptRanges = response.headers.get('accept-ranges');

    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'public, max-age=3600');
    if (contentLength) res.setHeader('Content-Length', contentLength);
    if (contentRange) res.setHeader('Content-Range', contentRange);
    if (acceptRanges) res.setHeader('Accept-Ranges', acceptRanges);

    res.status(response.status);

    // Faz o stream direto do corpo da resposta para o navegador sem estourar memória
    const reader = response.body.getReader();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      res.write(Buffer.from(value));
    }
    res.end();
  } catch (error) {
    console.error('Erro no proxy:', error);
    res.status(500).send('Erro interno no servidor de mídia');
  }
}