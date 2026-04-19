const http = require('http');

const invoke = (action, params = {}) => new Promise((resolve, reject) => {
  const body = JSON.stringify({ action, version: 6, params });
  const req = http.request('http://127.0.0.1:8765', {method: 'POST'}, res => {
    let d = ''; res.on('data', c => d += c);
    res.on('end', () => {
      try {
        const r = JSON.parse(d);
        if (r.error) reject(new Error(r.error));
        else resolve(r.result);
      } catch (e) { reject(e); }
    });
  });
  req.on('error', reject);
  req.write(body); req.end();
});

(async () => {
  try {
    const notes = await invoke('notesInfo', { notes: [1755676734055] });
    if (!notes || notes.length === 0) {
      console.log('No note found for ID 1755676734055');
      return;
    }
    const note = notes[0];
    const front = note.fields.正面 ? note.fields.正面.value : '';
    const back = note.fields.背面 ? note.fields.背面.value : '';

    console.log('--- Front (First 300) ---');
    console.log(front.substring(0, 300));
    console.log('\n--- Back (First 500) ---');
    console.log(back.substring(0, 500));
    console.log('\n--- Check String ---');
    console.log('Contains "Open in Obsidian":', back.includes('Open in Obsidian'));
  } catch (e) {
    console.error('Error:', e.message);
  }
})();
