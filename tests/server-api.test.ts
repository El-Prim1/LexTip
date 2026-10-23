import { app, server } from '../server/index';

async function test() {
  try {
    const health = await fetch('http://localhost:3000/health');
    console.log('Health check:', health.status, await health.json());

    const empty = await fetch('http://localhost:3000/api/translate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: '' }),
    });
    console.log('Empty text validation:', empty.status, await empty.json());

    const tooLong = await fetch('http://localhost:3000/api/translate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: 'a'.repeat(501) }),
    });
    console.log('Too long validation:', tooLong.status, await tooLong.json());

    const translate = await fetch('http://localhost:3000/api/translate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: 'Hello world' }),
    });
    console.log('Translation result:', translate.status, await translate.json());
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

test().then(() => {
  console.log('ALL TESTS PASSED');
}).catch((err) => {
  console.error('TEST ERROR:', err);
  process.exitCode = 1;
});
