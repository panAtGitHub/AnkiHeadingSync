const http = require('http');

const invoke = (action, params = {}) => new Promise((resolve, reject) => {
  const body = JSON.stringify({ action, version: 6, params });
  const req = http.request('http://127.0.0.1:8765', { method: 'POST' }, res => {
    let d = '';
    res.on('data', c => d += c);
    res.on('end', () => {
      try {
        const r = JSON.parse(d);
        if (r.error) reject(new Error(r.error));
        else resolve(r.result);
      } catch (e) {
        reject(e);
      }
    });
  });
  req.on('error', reject);
  req.write(body);
  req.end();
});

(async () => {
  try {
    const noteIds = [1755676734055, 1776577443442];
    const notesInfo = await invoke('notesInfo', { notes: noteIds });

    for (let i = 0; i < noteIds.length; i++) {
        const noteId = noteIds[i];
        const info = notesInfo[i];
        
        console.log(`--- Note ID: ${noteId} ---`);
        if (!info || Object.keys(info).length === 0) {
            console.log('Exists: No');
            continue;
        }

        console.log('Exists: Yes');
        console.log('Model Name:', info.modelName);

        const cards = await invoke('cardsInfo', { cards: info.cards });
        if (cards && cards.length > 0) {
            console.log('Deck Name:', cards[0].deckName);
            console.log('Card IDs:', info.cards.join(', '));
        }

        const front = info.fields.Front?.value || info.fields['正面']?.value || 'N/A';
        const back = info.fields.Back?.value || info.fields['背面']?.value || 'N/A';

        console.log('Front (First 200 chars):', front.substring(0, 200));
        console.log('Back (First 200 chars):', back.substring(0, 200));
        console.log('\n');
    }
  } catch (e) {
    console.error('Error:', e.message);
  }
})();
